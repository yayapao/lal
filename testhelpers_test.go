package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testApp(t *testing.T) *App {
	t.Helper()
	app := newAppWithConfigPath(emptyConfig(t))
	app.commandShell = "/bin/sh"
	app.commandArgs = []string{"-c"}
	app.stopTimeout = 500 * time.Millisecond
	t.Cleanup(app.stopAllProcesses)
	return app
}

func emptyConfig(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	data, err := json.Marshal(configFile{Version: configVersion, Services: []Service{}})
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}

func serviceState(t *testing.T, app *App, id string) ServiceView {
	t.Helper()
	for _, service := range app.GetAppState().Services {
		if service.ID == id {
			return service
		}
	}
	t.Fatalf("service %s not found", id)
	return ServiceView{}
}

func resourceState(t *testing.T, usage []ResourceUsage, id string) ResourceUsage {
	t.Helper()
	for _, resource := range usage {
		if resource.ServiceID == id {
			return resource
		}
	}
	t.Fatalf("resource usage for %s not found", id)
	return ResourceUsage{}
}

func logContains(entries []LogEntry, text string) bool {
	for _, entry := range entries {
		if strings.Contains(entry.Text, text) {
			return true
		}
	}
	return false
}

func assertServiceNames(t *testing.T, services []ServiceView, want []string) {
	t.Helper()
	if len(services) != len(want) {
		t.Fatalf("service count = %d, want %d", len(services), len(want))
	}
	for index, service := range services {
		if service.Name != want[index] {
			t.Fatalf("service %d = %q, want %q", index, service.Name, want[index])
		}
	}
}

func waitFor(t *testing.T, timeout time.Duration, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition was not met before timeout")
}
