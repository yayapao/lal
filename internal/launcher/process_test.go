package launcher

import (
	"errors"
	"net"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestHealthMonitorTracksConfiguredAddress(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatalf("release port: %v", err)
	}
	app := testApp(t)
	app.healthEvery = 15 * time.Millisecond
	app.healthGrace = 30 * time.Millisecond
	app.healthTimeout = 20 * time.Millisecond
	service, err := app.CreateService(ServiceInput{
		Name:      "Healthy",
		Directory: t.TempDir(),
		Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
		URL:       "http://" + address,
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	listener, err = net.Listen("tcp", address)
	if err != nil {
		t.Fatalf("listen after start: %v", err)
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

func TestStartRejectsOccupiedPortWithResolution(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{
		Name:      "Occupied",
		Directory: t.TempDir(),
		Command:   "exit 0",
		URL:       "http://" + listener.Addr().String(),
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	app.appendLog(service.ID, "system", "保留旧日志")

	err = app.StartService(service.ID)
	if err == nil || !strings.Contains(err.Error(), "已被") || !strings.Contains(err.Error(), "lsof") || !strings.Contains(err.Error(), "修改服务") {
		t.Fatalf("unexpected port conflict error: %v", err)
	}
	if state := serviceState(t, app, service.ID); state.Status != "failed" || state.PID != 0 {
		t.Fatalf("service started despite occupied port: %#v", state)
	}
	if !logContains(app.GetLogs(service.ID), "保留旧日志") {
		t.Fatal("preflight failure cleared previous logs")
	}
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
	app.appendLog(service.ID, "system", "stale log")

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
	if logContains(app.GetLogs(service.ID), "stale log") {
		t.Fatal("start did not clear previous logs")
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

func TestRestartServiceStopsAndStartsManagedProcess(t *testing.T) {
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{
		Name:      "Restartable",
		Directory: t.TempDir(),
		Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	firstPID := serviceState(t, app, service.ID).PID
	if firstPID == 0 {
		t.Fatal("service did not start")
	}

	if err := app.RestartService(service.ID); err != nil {
		t.Fatalf("restart service: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		state := serviceState(t, app, service.ID)
		return state.Status == "running" && state.PID != 0 && state.PID != firstPID
	})
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
