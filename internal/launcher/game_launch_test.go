package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestGameModesLaunchSeparateCommandsAndPersist(t *testing.T) {
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{
		Name: "Game", Module: moduleGame, Directory: t.TempDir(),
		Command: "echo DEBUG; sleep 30", ReleaseCommand: "echo RELEASE; sleep 30", LaunchMode: "release",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool { return logContains(app.GetLogs(service.ID), "RELEASE") })
	if _, err := app.SetGameLaunchMode(service.ID, "debug"); err == nil {
		t.Fatal("switched a running game")
	}
	if err := app.StopService(service.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetGameLaunchMode(service.ID, "debug"); err != nil {
		t.Fatal(err)
	}
	loaded := newAppWithConfigPath(app.configPath)
	if serviceState(t, loaded, service.ID).LaunchMode != "debug" {
		t.Fatal("mode not persisted")
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool { return logContains(app.GetLogs(service.ID), "DEBUG") })
	if logContains(app.GetLogs(service.ID), "RELEASE") {
		t.Fatal("release command ran in Debug mode")
	}
}

func TestGameModeRejectsMissingReleaseAndInvalidMode(t *testing.T) {
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Game", Module: moduleGame, Directory: t.TempDir(), Command: "echo DEBUG"})
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"release", "invalid", ""} {
		if _, err := app.SetGameLaunchMode(service.ID, mode); err == nil {
			t.Fatalf("accepted %q", mode)
		}
	}
	if got := serviceState(t, app, service.ID); got.LaunchMode != "" {
		t.Fatal("failed switch changed config")
	}
}

func TestLegacyGameImportsDeclaredReleaseAndKeepsServices(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".lal.json"), []byte(`{"releaseCommand":"dist/Game"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	config := configFile{Version: 6, Services: []Service{
		{ID: "game", Name: "Game", Module: moduleGame, Directory: dir, Command: "godot --path ."},
		{ID: "web", Name: "Web", Module: moduleService, Directory: dir, Command: "npm run dev"},
	}}
	path := filepath.Join(t.TempDir(), "config.json")
	data, _ := json.Marshal(config)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	app := newAppWithConfigPath(path)
	if app.configWarn != "" {
		t.Fatal(app.configWarn)
	}
	game := serviceState(t, app, "game")
	if game.LaunchMode != "release" || game.ReleaseCommand != "dist/Game" {
		t.Fatalf("missing release: %#v", game)
	}
	if web := serviceState(t, app, "web"); web.ReleaseCommand != "" || web.LaunchMode != "" {
		t.Fatal("changed a service")
	}
	if _, err := app.SetGameLaunchMode("web", "debug"); err == nil {
		t.Fatal("accepted service mode")
	}
}
