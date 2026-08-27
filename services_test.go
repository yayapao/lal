package main

import (
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestServiceConfigLifecycle(t *testing.T) {
	configPath := emptyConfig(t)
	projectDir := t.TempDir()
	app := newAppWithConfigPath(configPath)
	if _, err := app.CreateService(ServiceInput{Name: "Invalid", Directory: " ", Command: "npm run dev"}); err == nil {
		t.Fatal("expected an empty directory to fail")
	}
	if _, err := app.CreateService(ServiceInput{Name: "Invalid URL", Directory: projectDir, Command: "npm run dev", URL: "file:///tmp"}); err == nil {
		t.Fatal("expected a non-http URL to fail")
	}

	created, err := app.CreateService(ServiceInput{
		Name:      "API",
		Directory: projectDir,
		Command:   "npm run dev",
		URL:       "localhost:4321/",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if created.ID == "" || created.Name != "API" || !created.PathExists || created.URL != "http://localhost:4321" {
		t.Fatalf("unexpected created service: %#v", created)
	}

	if _, err := app.CreateService(ServiceInput{Name: "api", Directory: projectDir, Command: "go run ."}); err == nil {
		t.Fatal("expected duplicate service name to fail")
	}

	updated, err := app.UpdateService(created.ID, ServiceInput{
		Name:      "Gateway",
		Directory: projectDir,
		Command:   "go run .",
		URL:       "https://localhost:8443",
	})
	if err != nil {
		t.Fatalf("update service: %v", err)
	}
	if updated.Name != "Gateway" || updated.Command != "go run ." || updated.URL != "https://localhost:8443" {
		t.Fatalf("unexpected updated service: %#v", updated)
	}

	reloaded := newAppWithConfigPath(configPath).GetAppState()
	if len(reloaded.Services) != 1 || reloaded.Services[0].Name != "Gateway" || reloaded.Services[0].URL != "https://localhost:8443" {
		t.Fatalf("service was not persisted: %#v", reloaded.Services)
	}

	if err := app.DeleteService(created.ID); err != nil {
		t.Fatalf("delete service: %v", err)
	}
	if services := newAppWithConfigPath(configPath).GetAppState().Services; len(services) != 0 {
		t.Fatalf("deleted service was persisted: %#v", services)
	}
}

func TestVersionOneConfigMigratesKnownServiceURLs(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	legacy := configFile{Version: 1, Services: []Service{{
		ID:        "viewai",
		Name:      "ViewAI",
		Directory: "/Users/yango/Documents/huyaprojects/ai/viewai",
		Command:   "npm run dev",
	}}}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy config: %v", err)
	}
	if err := os.WriteFile(configPath, data, 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	state := newAppWithConfigPath(configPath).GetAppState()
	if len(state.Services) != 1 || state.Services[0].URL != "http://localhost:3900" {
		t.Fatalf("known URL was not migrated: %#v", state.Services)
	}
	updatedData, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read migrated config: %v", err)
	}
	var updated configFile
	if err := json.Unmarshal(updatedData, &updated); err != nil {
		t.Fatalf("unmarshal migrated config: %v", err)
	}
	if updated.Version != configVersion {
		t.Fatalf("config version = %d, want %d", updated.Version, configVersion)
	}
}

func TestHealthMonitorTracksConfiguredAddress(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	app := testApp(t)
	app.healthEvery = 15 * time.Millisecond
	app.healthGrace = 30 * time.Millisecond
	app.healthTimeout = 20 * time.Millisecond
	service, err := app.CreateService(ServiceInput{
		Name:      "Healthy",
		Directory: t.TempDir(),
		Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
		URL:       "http://" + listener.Addr().String(),
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		return serviceState(t, app, service.ID).Health == "ready"
	})
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		return serviceState(t, app, service.ID).Health == "unreachable"
	})
}

func TestDefaultShellRunsWithoutInteractiveJobControl(t *testing.T) {
	app := newAppWithConfigPath(emptyConfig(t))
	app.stopTimeout = 500 * time.Millisecond
	t.Cleanup(app.stopAllProcesses)
	service, err := app.CreateService(ServiceInput{
		Name:      "Shell",
		Directory: t.TempDir(),
		Command:   "case $- in *i*) exit 9;; esac; printf 'non-interactive\\n'; trap 'exit 0' TERM; while :; do sleep 1; done",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	waitFor(t, 3*time.Second, func() bool {
		return logContains(app.GetLogs(service.ID), "non-interactive")
	})
	if state := serviceState(t, app, service.ID); state.Status != "running" {
		t.Fatalf("shell did not stay running: %#v", state)
	}
}

func TestSelectedBatchKeepsServiceOrderStable(t *testing.T) {
	app := testApp(t)
	services := make(map[string]ServiceView)
	for _, name := range []string{"Zulu", "Alpha", "Middle"} {
		service, err := app.CreateService(ServiceInput{
			Name:      name,
			Directory: t.TempDir(),
			Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
		})
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		services[name] = service
	}

	assertServiceNames(t, app.GetAppState().Services, []string{"Alpha", "Middle", "Zulu"})
	started := app.StartServices([]string{services["Zulu"].ID, services["Middle"].ID, services["Zulu"].ID})
	if started.Changed != 2 || started.Skipped != 0 || len(started.Errors) != 0 {
		t.Fatalf("unexpected start result: %#v", started)
	}
	assertServiceNames(t, app.GetAppState().Services, []string{"Alpha", "Middle", "Zulu"})
	if state := serviceState(t, app, services["Alpha"].ID); state.Status != "stopped" {
		t.Fatalf("unselected service changed state: %#v", state)
	}
	repeated := app.StartServices([]string{services["Middle"].ID, "missing"})
	if repeated.Changed != 0 || repeated.Skipped != 1 || len(repeated.Errors) != 1 {
		t.Fatalf("unexpected repeated start result: %#v", repeated)
	}
	unstarted := app.StopServices([]string{services["Alpha"].ID, "missing"})
	if unstarted.Changed != 0 || unstarted.Skipped != 1 || len(unstarted.Errors) != 1 {
		t.Fatalf("unexpected unstarted stop result: %#v", unstarted)
	}

	stopped := app.StopServices([]string{services["Zulu"].ID, services["Middle"].ID})
	if stopped.Changed != 2 || stopped.Skipped != 0 || len(stopped.Errors) != 0 {
		t.Fatalf("unexpected stop result: %#v", stopped)
	}
}

func TestParseResourceUsageAggregatesProcessGroups(t *testing.T) {
	usage := parseResourceUsage(`
  100  12.5  100
  100   0.5  200
  200   3.0  512
  999  40.0  999
  invalid row
`, map[int]string{100: "alpha", 200: "beta"}, []string{"stopped", "beta", "alpha"})

	if len(usage) != 3 {
		t.Fatalf("usage count = %d, want 3", len(usage))
	}
	if usage[0].ServiceID != "alpha" || usage[0].CPUPercent != 13 || usage[0].MemoryBytes != 300*1024 || usage[0].ProcessCount != 2 {
		t.Fatalf("unexpected alpha usage: %#v", usage[0])
	}
	if usage[1].ServiceID != "beta" || usage[1].CPUPercent != 3 || usage[1].MemoryBytes != 512*1024 || usage[1].ProcessCount != 1 {
		t.Fatalf("unexpected beta usage: %#v", usage[1])
	}
	if usage[2].ServiceID != "stopped" || usage[2].CPUPercent != 0 || usage[2].MemoryBytes != 0 || usage[2].ProcessCount != 0 {
		t.Fatalf("unexpected stopped usage: %#v", usage[2])
	}
}

func TestStopKillsProcessGroupAfterTimeout(t *testing.T) {
	app := testApp(t)
	app.stopTimeout = 120 * time.Millisecond
	service, err := app.CreateService(ServiceInput{
		Name:      "Stubborn",
		Directory: t.TempDir(),
		Command:   "trap '' TERM; while :; do sleep 1; done",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	pid := serviceState(t, app, service.ID).PID
	if err := app.StopService(service.ID); err != nil {
		t.Fatalf("stop service: %v", err)
	}
	if processGroupExists(pid) {
		t.Fatalf("process group %d survived the stop timeout", pid)
	}
}

func TestProcessLifecycleCapturesLogsAndStopsGroup(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	service, err := app.CreateService(ServiceInput{
		Name:      "Long running",
		Directory: projectDir,
		Command:   "printf 'ready\\n'; trap 'exit 0' TERM; while :; do sleep 1; done",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}

	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		return logContains(app.GetLogs(service.ID), "ready")
	})

	running := serviceState(t, app, service.ID)
	if running.Status != "running" || running.PID == 0 {
		t.Fatalf("unexpected running state: %#v", running)
	}
	usage, err := app.GetResourceUsage()
	if err != nil {
		t.Fatalf("get resource usage: %v", err)
	}
	resources := resourceState(t, usage, service.ID)
	if resources.ProcessCount == 0 || resources.MemoryBytes == 0 {
		t.Fatalf("process group resources were not collected: %#v", resources)
	}
	pid := running.PID

	if err := app.StopService(service.ID); err != nil {
		t.Fatalf("stop service: %v", err)
	}
	stopped := serviceState(t, app, service.ID)
	if stopped.Status != "stopped" || stopped.PID != 0 {
		t.Fatalf("unexpected stopped state: %#v", stopped)
	}
	if err := syscall.Kill(-pid, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("process group %d is still alive: %v", pid, err)
	}
}

func TestFailedProcessReportsExitCode(t *testing.T) {
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{
		Name:      "Failing",
		Directory: t.TempDir(),
		Command:   "printf 'broken\\n' >&2; exit 7",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}

	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		return serviceState(t, app, service.ID).Status == "failed"
	})

	failed := serviceState(t, app, service.ID)
	if !strings.Contains(failed.LastError, "退出码 7") {
		t.Fatalf("missing exit code: %#v", failed)
	}
	if !logContains(app.GetLogs(service.ID), "broken") {
		t.Fatalf("stderr was not captured: %#v", app.GetLogs(service.ID))
	}
}

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
