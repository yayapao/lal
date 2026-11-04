package launcher

import (
	"context"
	"reflect"
	"testing"
)

func TestNetworkParsers(t *testing.T) {
	route := parseNetworkRoute("gateway: 192.168.31.1\n interface: en0\n")
	if route.Gateway != "192.168.31.1" || route.Interface != "en0" {
		t.Fatalf("unexpected route: %+v", route)
	}
	if parseNetworkRoute("gateway: link#19\ninterface: utun0").Gateway != "" {
		t.Fatal("a link route is not a gateway address")
	}
	ports := parseHardwarePorts("Hardware Port: Wi-Fi\nDevice: en0\n\nHardware Port: Ethernet\nDevice: en1")
	if ports["en0"] != "Wi-Fi" || ports["en1"] != "Ethernet" {
		t.Fatalf("unexpected ports: %v", ports)
	}
	dns := parseNetworkDNS("nameserver[0] : 192.168.1.1\nnameserver[1] : 2001:4860:4860::8888\nnameserver[0] : 192.168.1.1\n nameserver[2] : bad")
	if !reflect.DeepEqual(dns, []string{"192.168.1.1", "2001:4860:4860::8888"}) {
		t.Fatalf("unexpected DNS: %v", dns)
	}
}

func TestNetworkAddressesAndLANSelection(t *testing.T) {
	wifi := NetworkInterface{Name: "en0", Hardware: true, Up: true, Gateway: "192.168.1.1"}
	addInterfaceAddress(&wifi, "192.168.1.8/24")
	addInterfaceAddress(&wifi, "fe80::1234/64")
	addInterfaceAddress(&wifi, "169.254.2.1/16")
	if wifi.SubnetMask != "255.255.255.0" || len(wifi.IPv4) != 1 || wifi.IPv6[0] != "fe80::1234%en0" {
		t.Fatalf("incorrect addresses: %+v", wifi)
	}
	items := []NetworkInterface{
		{Name: "utun0", Up: true, IPv4: []string{"10.0.0.1"}},
		{Name: "en1", Hardware: true, Up: true, IPv4: []string{"10.1.1.8"}},
		wifi,
	}
	if got := chooseLANInterface(items, "utun0"); got != "en0" {
		t.Fatalf("VPN default must not replace LAN: %s", got)
	}
	if got := chooseLANInterface(items, "en1"); got != "en1" {
		t.Fatalf("physical default should win: %s", got)
	}
	items[1].Up, items[2].Up = false, false
	if got := chooseLANInterface(items, "utun0"); got != "" {
		t.Fatalf("offline should have no LAN: %s", got)
	}
}

func TestNetworkCommandFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := networkCommand(ctx, "/sbin/ifconfig", "-a"); err == nil {
		t.Fatal("cancelled probes must return an error")
	}
}
