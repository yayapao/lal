package main

import (
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestServiceConfigLifecycle(t *testing.T) {
	configPath := emptyConfig(t)
	projectDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(projectDir, defaultPromptsDir), 0o755); err != nil {
		t.Fatalf("create prompt directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(projectDir, defaultPromptsDir, "codex-startup.md"), []byte("Start this session"), 0o600); err != nil {
		t.Fatalf("write prompt: %v", err)
	}
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
	if created.ID == "" || created.Name != "API" || !created.PathExists || created.URL != "http://localhost:4321" || created.CleanCommand != defaultCleanCommand || len(created.PromptFiles) != 0 {
		t.Fatalf("unexpected created service: %#v", created)
	}

	if _, err := app.CreateService(ServiceInput{Name: "api", Directory: projectDir, Command: "go run ."}); err == nil {
		t.Fatal("expected duplicate service name to fail")
	}

	updated, err := app.UpdateService(created.ID, ServiceInput{
		Name:         "Gateway",
		Directory:    projectDir,
		Command:      "go run .",
		URL:          "https://localhost:8443",
		CleanCommand: "rm -rf .next .turbo",
	})
	if err != nil {
		t.Fatalf("update service: %v", err)
	}
	if updated.Name != "Gateway" || updated.Command != "go run ." || updated.URL != "https://localhost:8443" || updated.CleanCommand != "rm -rf .next .turbo" {
		t.Fatalf("unexpected updated service: %#v", updated)
	}

	reloaded := newAppWithConfigPath(configPath).GetAppState()
	if len(reloaded.Services) != 1 || reloaded.Services[0].Name != "Gateway" || reloaded.Services[0].URL != "https://localhost:8443" || reloaded.Services[0].CleanCommand != "rm -rf .next .turbo" {
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
	if len(state.Services) != 1 || state.Services[0].URL != "http://localhost:3900" || state.Services[0].CleanCommand != defaultCleanCommand {
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

func TestPromptsDiscoverProjectFilesAndManageAddedFiles(t *testing.T) {
	projectDir := t.TempDir()
	projectPrompt := filepath.Join(projectDir, defaultPromptsDir, "startup.md")
	if err := os.MkdirAll(filepath.Dir(projectPrompt), 0o755); err != nil {
		t.Fatalf("create prompt directory: %v", err)
	}
	if err := os.WriteFile(projectPrompt, []byte("project prompt\n"), 0o600); err != nil {
		t.Fatalf("write project prompt: %v", err)
	}
	app := newAppWithConfigPath(emptyConfig(t))
	service, err := app.CreateService(ServiceInput{
		Name:      "Prompted",
		Directory: projectDir,
		Command:   "npm run dev",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	prompts, err := app.GetPrompts(service.ID)
	if err != nil || len(prompts) != 1 || prompts[0].Path != projectPrompt || prompts[0].DisplayPath != "prompts/startup.md" || prompts[0].Content != "project prompt\n" || prompts[0].Source != "project" {
		t.Fatalf("unexpected discovered prompts: %#v, %v", prompts, err)
	}
	prompt, err := app.readCodexPrompt(service.ID, projectPrompt)
	if err != nil || prompt != "project prompt\n" {
		t.Fatalf("read project prompt = %q, %v", prompt, err)
	}
	if err := os.WriteFile(projectPrompt, []byte("updated project prompt\n"), 0o600); err != nil {
		t.Fatalf("update project prompt: %v", err)
	}
	prompt, err = app.readCodexPrompt(service.ID, projectPrompt)
	if err != nil || prompt != "updated project prompt\n" {
		t.Fatalf("read updated project prompt = %q, %v", prompt, err)
	}

	addedPrompt := filepath.Join(t.TempDir(), "shared.md")
	if err := os.WriteFile(addedPrompt, []byte("shared prompt"), 0o600); err != nil {
		t.Fatalf("write added prompt: %v", err)
	}
	if err := app.AddPromptFile(service.ID, addedPrompt); err != nil {
		t.Fatalf("add prompt: %v", err)
	}
	prompts, err = app.GetPrompts(service.ID)
	if err != nil || len(prompts) != 2 || prompts[1].Path != addedPrompt || prompts[1].Source != "added" {
		t.Fatalf("unexpected prompts after add: %#v, %v", prompts, err)
	}
	if err := app.RemovePromptFile(service.ID, addedPrompt); err != nil {
		t.Fatalf("remove prompt association: %v", err)
	}
	if _, err := os.Stat(addedPrompt); err != nil {
		t.Fatalf("removing association deleted source file: %v", err)
	}
	if prompts, err = newAppWithConfigPath(app.configPath).GetPrompts(service.ID); err != nil || len(prompts) != 1 {
		t.Fatalf("prompt association was not removed: %#v, %v", prompts, err)
	}
	if err := app.RemovePromptFile(service.ID, projectPrompt); err == nil {
		t.Fatal("expected project prompt removal to fail")
	}
}

func TestLegacySinglePromptPathMigratesToAddedPrompt(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	projectDir := t.TempDir()
	legacy := configFile{Version: 4, Services: []Service{{
		ID: "legacy", Name: "Legacy", Directory: projectDir, Command: "npm run dev", CleanCommand: defaultCleanCommand, PromptFile: "docs/session.md",
	}}}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy config: %v", err)
	}
	if err := os.WriteFile(configPath, data, 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	service := newAppWithConfigPath(configPath).GetAppState().Services[0]
	if service.PromptFile != "" || len(service.PromptFiles) != 1 || service.PromptFiles[0] != "docs/session.md" {
		t.Fatalf("legacy prompt was not migrated: %#v", service)
	}
}

func TestCodexAppArgumentsPreserveDirectory(t *testing.T) {
	workspace := "/tmp/My Project"
	want := []string{"app", workspace}
	if got := codexAppArguments(workspace); !reflect.DeepEqual(got, want) {
		t.Fatalf("Codex arguments = %#v, want %#v", got, want)
	}
}

func TestCodexPasteReplacesTheOpenedConversationDraft(t *testing.T) {
	selectAll := strings.Index(codexNewConversationAndPasteScript, `keystroke "a" using command down`)
	paste := strings.Index(codexNewConversationAndPasteScript, `keystroke "v" using command down`)
	if selectAll < 0 || paste < 0 || selectAll >= paste {
		t.Fatalf("expected draft selection before paste:\n%s", codexNewConversationAndPasteScript)
	}
	if strings.Contains(codexNewConversationAndPasteScript, `keystroke "n" using command down`) {
		t.Fatalf("Codex app command already opens a new conversation:\n%s", codexNewConversationAndPasteScript)
	}
}

func TestServiceViewDetectsProjectTypeFromPackageManifest(t *testing.T) {
	configPath := emptyConfig(t)
	projectDir := t.TempDir()
	manifest := `{"name":"web","dependencies":{"next":"15.0.0","react":"19.0.0"}}`
	if err := os.WriteFile(filepath.Join(projectDir, "package.json"), []byte(manifest), 0o600); err != nil {
		t.Fatalf("write package manifest: %v", err)
	}
	app := newAppWithConfigPath(configPath)
	service, err := app.CreateService(ServiceInput{Name: "Next app", Directory: projectDir, Command: "npm run dev"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if service.ProjectType != "nextjs" {
		t.Fatalf("project type = %q, want nextjs", service.ProjectType)
	}
}

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

func TestClearNextCacheRemovesDirectoryAndRestartsRunningService(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	cacheDir := filepath.Join(projectDir, ".next")
	if err := os.MkdirAll(filepath.Join(cacheDir, "cache"), 0o755); err != nil {
		t.Fatalf("create cache: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cacheDir, "cache", "stale"), []byte("stale"), 0o600); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	service, err := app.CreateService(ServiceInput{
		Name:      "Next app",
		Directory: projectDir,
		Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	firstPID := serviceState(t, app, service.ID).PID

	if err := app.ClearNextCache(service.ID); err != nil {
		t.Fatalf("clear Next.js cache: %v", err)
	}
	if _, err := os.Stat(cacheDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf(".next still exists after cleanup: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		state := serviceState(t, app, service.ID)
		return state.Status == "running" && state.PID != 0 && state.PID != firstPID
	})
}

func TestClearNextCacheWorksForStoppedService(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(projectDir, ".next"), 0o755); err != nil {
		t.Fatalf("create cache: %v", err)
	}
	service, err := app.CreateService(ServiceInput{Name: "Stopped Next", Directory: projectDir, Command: "exit 0"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.ClearNextCache(service.ID); err != nil {
		t.Fatalf("clear Next.js cache: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectDir, ".next")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf(".next still exists after cleanup: %v", err)
	}
	if state := serviceState(t, app, service.ID); state.Status != "stopped" {
		t.Fatalf("stopped service changed state: %#v", state)
	}
}

func TestClearNextCacheRunsCustomCommandInProjectDirectory(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	for _, directory := range []string{".next", "build/cache", "keep"} {
		if err := os.MkdirAll(filepath.Join(projectDir, directory), 0o755); err != nil {
			t.Fatalf("create %s: %v", directory, err)
		}
	}
	service, err := app.CreateService(ServiceInput{
		Name:         "Custom cache",
		Directory:    projectDir,
		Command:      "exit 0",
		CleanCommand: "rm -rf .next build/cache",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.ClearNextCache(service.ID); err != nil {
		t.Fatalf("clear custom cache: %v", err)
	}
	for _, directory := range []string{".next", "build/cache"} {
		if _, err := os.Stat(filepath.Join(projectDir, directory)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("custom cache %s still exists: %v", directory, err)
		}
	}
	if _, err := os.Stat(filepath.Join(projectDir, "keep")); err != nil {
		t.Fatalf("unlisted directory was removed: %v", err)
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

func TestFormatLogEntriesPrefixesEveryLine(t *testing.T) {
	formatted := formatLogEntries([]LogEntry{{
		Timestamp: "2026-08-27T15:30:45.123456+08:00",
		Stream:    "system",
		Text:      "端口被占用\n检查命令：lsof",
	}})
	if strings.Count(formatted, "[SYSTEM]") != 2 || !strings.Contains(formatted, "端口被占用") || !strings.Contains(formatted, "检查命令：lsof") {
		t.Fatalf("unexpected formatted log:\n%s", formatted)
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
