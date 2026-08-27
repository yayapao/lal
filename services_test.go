package main

import (
	"encoding/json"
	"errors"
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

	created, err := app.CreateService(ServiceInput{
		Name:      "API",
		Directory: projectDir,
		Command:   "npm run dev",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if created.ID == "" || created.Name != "API" || !created.PathExists {
		t.Fatalf("unexpected created service: %#v", created)
	}

	if _, err := app.CreateService(ServiceInput{Name: "api", Directory: projectDir, Command: "go run ."}); err == nil {
		t.Fatal("expected duplicate service name to fail")
	}

	updated, err := app.UpdateService(created.ID, ServiceInput{
		Name:      "Gateway",
		Directory: projectDir,
		Command:   "go run .",
	})
	if err != nil {
		t.Fatalf("update service: %v", err)
	}
	if updated.Name != "Gateway" || updated.Command != "go run ." {
		t.Fatalf("unexpected updated service: %#v", updated)
	}

	reloaded := newAppWithConfigPath(configPath).GetAppState()
	if len(reloaded.Services) != 1 || reloaded.Services[0].Name != "Gateway" {
		t.Fatalf("service was not persisted: %#v", reloaded.Services)
	}

	if err := app.DeleteService(created.ID); err != nil {
		t.Fatalf("delete service: %v", err)
	}
	if services := newAppWithConfigPath(configPath).GetAppState().Services; len(services) != 0 {
		t.Fatalf("deleted service was persisted: %#v", services)
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

func logContains(entries []LogEntry, text string) bool {
	for _, entry := range entries {
		if strings.Contains(entry.Text, text) {
			return true
		}
	}
	return false
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
