package launcher

import (
	"net"
	"strings"
)

type networkRoute struct{ Interface, Gateway string }

func parseNetworkRoute(output string) networkRoute {
	var result networkRoute
	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(strings.TrimSpace(line), ":")
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		if key == "interface" {
			result.Interface = value
		}
		if key == "gateway" {
			if ip := net.ParseIP(value); ip != nil && ip.To4() != nil {
				result.Gateway = value
			}
		}
	}
	return result
}

func parseHardwarePorts(output string) map[string]string {
	ports := map[string]string{}
	label := ""
	for _, line := range strings.Split(output, "\n") {
		key, value, _ := strings.Cut(line, ":")
		switch strings.TrimSpace(key) {
		case "Hardware Port":
			label = strings.TrimSpace(value)
		case "Device":
			ports[strings.TrimSpace(value)] = label
		}
	}
	return ports
}

func addInterfaceAddress(item *NetworkInterface, address string) {
	ip, subnet, err := net.ParseCIDR(address)
	if err != nil {
		return
	}
	if ipv4 := ip.To4(); ipv4 != nil {
		if !ip.IsUnspecified() && !ip.IsLinkLocalUnicast() {
			item.IPv4 = append(item.IPv4, ipv4.String())
			if item.SubnetMask == "" {
				item.SubnetMask = net.IP(subnet.Mask).String()
			}
		}
		return
	}
	value := ip.String()
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		value += "%" + item.Name
	}
	item.IPv6 = append(item.IPv6, value)
}

func isLANInterface(item NetworkInterface) bool {
	return item.Hardware && item.Up && !item.Loopback && len(item.IPv4) > 0
}

func chooseLANInterface(interfaces []NetworkInterface, defaultName string) string {
	selected, score := "", -1
	for _, item := range interfaces {
		if !isLANInterface(item) {
			continue
		}
		priority := 0
		if item.Gateway != "" {
			priority += 1
		}
		if item.Name == defaultName {
			priority += 2
		}
		if priority > score {
			selected, score = item.Name, priority
		}
	}
	return selected
}

func parseNetworkDNS(output string) []string {
	result := []string{}
	seen := map[string]bool{}
	for _, line := range strings.Split(output, "\n") {
		key, value, _ := strings.Cut(strings.TrimSpace(line), ":")
		value = strings.TrimSpace(value)
		if strings.HasPrefix(key, "nameserver[") && net.ParseIP(strings.Split(value, "%")[0]) != nil && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}
