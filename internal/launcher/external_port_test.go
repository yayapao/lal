package launcher

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func externalTestServer(t *testing.T, directory string) (string, *exec.Cmd) {
	t.Helper()
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 unavailable")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	cmd := exec.Command(python, "-m", "http.server", strconv.Itoa(port), "--bind", "127.0.0.1")
	cmd.Dir = directory
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cmd.Process.Kill(); cmd.Wait() })
	address := fmt.Sprintf("http://127.0.0.1:%d", port)
	waitFor(t, 3*time.Second, func() bool { ready, _ := probeAccessURL(address, 20*time.Millisecond); return ready })
	return address, cmd
}

func TestExternalPortStatusAndConfirmedRestart(t *testing.T) {
	directory := t.TempDir()
	address, cmd := externalTestServer(t, directory)
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "External", Directory: directory, Command: "sleep 30", URL: address})
	if err != nil {
		t.Fatal(err)
	}
	state := serviceState(t, app, service.ID)
	if state.Port == nil || !state.Port.MatchesProject || !state.Port.Accessible || state.Port.PID != cmd.Process.Pid || state.PID != 0 {
		t.Fatalf("incorrect external state: %#v", state)
	}
	if err := app.StopExternalAndStart(service.ID, state.Port.PID, "stale identity"); err == nil {
		t.Fatal("accepted stale identity")
	}
	if ready, _ := probeAccessURL(address, 20*time.Millisecond); !ready {
		t.Fatal("stale request stopped listener")
	}
	if err := app.StopExternalAndStart(service.ID, state.Port.PID, state.Port.Identity); err != nil {
		t.Fatal(err)
	}
	state = serviceState(t, app, service.ID)
	if state.Status != "running" || state.PID == 0 || state.Port != nil {
		t.Fatalf("not managed after restart: %#v", state)
	}
}

func TestExternalPortRejectsUnrelatedProjectAndDisappearsAfterExit(t *testing.T) {
	address, cmd := externalTestServer(t, t.TempDir())
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Conflict", Directory: t.TempDir(), Command: "sleep 30", URL: address})
	if err != nil {
		t.Fatal(err)
	}
	port := serviceState(t, app, service.ID).Port
	if port == nil || port.MatchesProject {
		t.Fatalf("incorrect conflict: %#v", port)
	}
	if err := app.StopExternalAndStart(service.ID, port.PID, port.Identity); err == nil {
		t.Fatal("stopped unrelated listener")
	}
	if ready, _ := probeAccessURL(address, 20*time.Millisecond); !ready {
		t.Fatal("unrelated listener stopped")
	}
	cmd.Process.Kill()
	waitFor(t, time.Second, func() bool { return serviceState(t, app, service.ID).Port == nil })
}

func TestNativeGameIgnoresIndependentPreviewPort(t *testing.T) {
	directory := t.TempDir()
	address, cmd := externalTestServer(t, directory)
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "godot"), []byte("#!/bin/sh\nexec sleep 30\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Native", Module: moduleGame, Directory: directory, Command: "godot --path .", URL: address})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("preview blocked game: %v", err)
	}
	state := serviceState(t, app, service.ID)
	if state.Status != "running" || state.Health != "not_configured" || state.Port == nil || !state.Port.PreviewOnly {
		t.Fatalf("mixed process and preview: %#v", state)
	}
	if err := app.RestartService(service.ID); err != nil {
		t.Fatal(err)
	}
	if err := app.StopService(service.ID); err != nil {
		t.Fatal(err)
	}
	if port := inspectExternalPort(service.Service); port == nil || port.PID != cmd.Process.Pid {
		t.Fatal("native lifecycle stopped independent preview")
	}
}

func TestExternalRestartCannotStopLALProcess(t *testing.T) {
	directory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Self", Directory: directory, Command: "sleep 30", URL: "http://" + listener.Addr().String()})
	if err != nil {
		t.Fatal(err)
	}
	port := serviceState(t, app, service.ID).Port
	if port == nil || port.PID != os.Getpid() || !port.MatchesProject {
		t.Fatalf("missing own listener: %#v", port)
	}
	if err := app.StopExternalAndStart(service.ID, port.PID, port.Identity); err == nil {
		t.Fatal("accepted LAL process termination")
	}
}

func TestPortCheckMatchesLocalAddress(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	occupied := fmt.Sprintf("http://127.0.0.1:%d", port)
	if err := checkServicePort(occupied); err == nil {
		t.Fatal("missed matching listener")
	}
	for _, host := range []string{"127.0.0.2", "example.com"} {
		if err := checkServicePort(fmt.Sprintf("http://%s:%d", host, port)); err != nil {
			t.Fatalf("unrelated address blocked: %v", err)
		}
	}
}
