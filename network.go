package main

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type NetworkInterface struct {
	Name       string   `json:"name"`
	Label      string   `json:"label"`
	Up         bool     `json:"up"`
	Loopback   bool     `json:"loopback"`
	Hardware   bool     `json:"hardware"`
	IPv4       []string `json:"ipv4"`
	IPv6       []string `json:"ipv6"`
	SubnetMask string   `json:"subnetMask"`
	Gateway    string   `json:"gateway"`
	MAC        string   `json:"mac"`
	MTU        int      `json:"mtu"`
}

type NetworkSnapshot struct {
	PrimaryInterface string             `json:"primaryInterface"`
	Interfaces       []NetworkInterface `json:"interfaces"`
	DNS              []string           `json:"dns"`
	Hostname         string             `json:"hostname"`
	Ifconfig         string             `json:"ifconfig"`
	Warnings         []string           `json:"warnings"`
	CheckedAt        string             `json:"checkedAt"`
}

func (a *App) GetNetworkInfo() (NetworkSnapshot, error) {
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return readNetworkInfo(ctx)
}

func (a *App) CopyNetworkValue(value string) error {
	if strings.TrimSpace(value) == "" || len(value) > 1024*1024 {
		return fmt.Errorf("没有可复制的网络信息")
	}
	return runtime.ClipboardSetText(a.ctx, value)
}

func readNetworkInfo(parent context.Context) (NetworkSnapshot, error) {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	result := NetworkSnapshot{Interfaces: []NetworkInterface{}, DNS: []string{}, Warnings: []string{}}
	interfaces, err := net.Interfaces()
	if err != nil {
		return result, fmt.Errorf("读取网络接口失败：%w", err)
	}
	read := func(label, path string, args ...string) string {
		output, err := networkCommand(ctx, path, args...)
		if err != nil {
			result.Warnings = append(result.Warnings, label+"读取失败")
			return ""
		}
		return output
	}
	ports := parseHardwarePorts(read("接口名称", "/usr/sbin/networksetup", "-listallhardwareports"))
	for _, iface := range interfaces {
		item := NetworkInterface{
			Name: iface.Name, Label: ports[iface.Name], Up: iface.Flags&net.FlagUp != 0,
			Loopback: iface.Flags&net.FlagLoopback != 0, MAC: iface.HardwareAddr.String(), MTU: iface.MTU,
			IPv4: []string{}, IPv6: []string{},
		}
		// Hardware port metadata keeps VPN and bridge routes out of the LAN summary.
		item.Hardware = item.Label != ""
		if item.Label == "" {
			item.Label = iface.Name
		}
		addresses, addrErr := iface.Addrs()
		if addrErr != nil {
			result.Warnings = append(result.Warnings, iface.Name+" 地址读取失败")
		}
		for _, address := range addresses {
			addInterfaceAddress(&item, address.String())
		}
		result.Interfaces = append(result.Interfaces, item)
	}
	defaultRoute := parseNetworkRoute(read("默认路由", "/sbin/route", "-n", "get", "default"))
	for i := range result.Interfaces {
		item := &result.Interfaces[i]
		if !isLANInterface(*item) {
			continue
		}
		if item.Name == defaultRoute.Interface {
			item.Gateway = defaultRoute.Gateway
		} else {
			// A scoped route still identifies the LAN router when a VPN owns the default.
			output, routeErr := networkCommand(ctx, "/sbin/route", "-n", "get", "-ifscope", item.Name, "default")
			if routeErr == nil {
				route := parseNetworkRoute(output)
				if route.Interface == item.Name {
					item.Gateway = route.Gateway
				}
			}
		}
	}
	result.PrimaryInterface = chooseLANInterface(result.Interfaces, defaultRoute.Interface)
	result.DNS = parseNetworkDNS(read("DNS", "/usr/sbin/scutil", "--dns"))
	result.Ifconfig = read("ifconfig", "/sbin/ifconfig", "-a")
	result.Hostname, err = os.Hostname()
	if err != nil {
		result.Warnings = append(result.Warnings, "主机名读取失败")
	}
	result.CheckedAt = time.Now().Format(time.RFC3339)
	return result, nil
}

func networkCommand(parent context.Context, path string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(parent, 1200*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	output, err := cmd.Output()
	return string(output), err
}
