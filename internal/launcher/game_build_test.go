package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func buildTestGame(t *testing.T, app *App, build string, before bool) ServiceView {
	t.Helper()
	service, err := app.CreateService(ServiceInput{
		Name: "Game", Module: moduleGame, Directory: t.TempDir(),
		Command: "echo DEBUG; sleep 30", ReleaseCommand: "echo RELEASE; sleep 30",
		LaunchMode: "release", BuildCommand: build, BuildBeforeLaunch: before,
	})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func TestGameBuildLaunchesOnlyFreshArtifact(t *testing.T) {
	app := testApp(t)
	game := buildTestGame(t, app, "sleep .05; echo FRESH > artifact", true)
	app.mu.Lock()
	app.services[0].ReleaseCommand = "cat artifact; sleep 30"
	app.mu.Unlock()
	if err := app.StartService(game.ID); err != nil {
		t.Fatal(err)
	}
	if got := serviceState(t, app, game.ID); got.Status != "building" {
		t.Fatalf("expected build phase, got %s", got.Status)
	}
	waitFor(t, 2*time.Second, func() bool {
		return serviceState(t, app, game.ID).Status == "running" && logContains(app.GetLogs(game.ID), "FRESH")
	})
	loaded := newAppWithConfigPath(app.configPath)
	if got := serviceState(t, loaded, game.ID); got.BuildCommand != game.BuildCommand || !got.BuildBeforeLaunch {
		t.Fatal("build settings were not persisted")
	}
}

func TestBuildFailureNeverLaunchesPreviousRelease(t *testing.T) {
	app := testApp(t)
	game := buildTestGame(t, app, "echo BUILD_FAILED >&2; exit 7", true)
	if err := app.StartService(game.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool { return serviceState(t, app, game.ID).Status == "failed" })
	if logContains(app.GetLogs(game.ID), "RELEASE") || !strings.Contains(serviceState(t, app, game.ID).LastError, "7") {
		t.Fatal("failed build launched a Release or lost the exit code")
	}
}

func TestStandaloneBuildDoesNotLaunchAndCanRunInDebugMode(t *testing.T) {
	app := testApp(t)
	game := buildTestGame(t, app, "echo EXPORTED > artifact", true)
	if _, err := app.SetGameLaunchMode(game.ID, "debug"); err != nil {
		t.Fatal(err)
	}
	if err := app.BuildGame(game.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool { return serviceState(t, app, game.ID).Status == "built" })
	if _, err := os.Stat(filepath.Join(game.Directory, "artifact")); err != nil {
		t.Fatal(err)
	}
	if logContains(app.GetLogs(game.ID), "RELEASE") || logContains(app.GetLogs(game.ID), "DEBUG") {
		t.Fatal("standalone build launched the game")
	}
}

func TestGameSkipsBuildInDebugAndWhenDisabled(t *testing.T) {
	for _, debug := range []bool{false, true} {
		t.Run(map[bool]string{true: "Debug", false: "ExistingRelease"}[debug], func(t *testing.T) {
			app := testApp(t)
			game := buildTestGame(t, app, "touch unwanted-build", debug)
			if debug {
				if _, err := app.SetGameLaunchMode(game.ID, "debug"); err != nil {
					t.Fatal(err)
				}
			}
			if err := app.StartService(game.ID); err != nil {
				t.Fatal(err)
			}
			waitFor(t, time.Second, func() bool { return serviceState(t, app, game.ID).Status == "running" })
			if _, err := os.Stat(filepath.Join(game.Directory, "unwanted-build")); !os.IsNotExist(err) {
				t.Fatal("unexpected build")
			}
		})
	}
}

func TestCancelBuildBlocksLaunchAndConflictingOperations(t *testing.T) {
	app := testApp(t)
	game := buildTestGame(t, app, "echo B >> count; sleep 30", true)
	var starts sync.WaitGroup
	for range 8 {
		starts.Go(func() {
			if err := app.StartService(game.ID); err != nil {
				t.Error(err)
			}
		})
	}
	starts.Wait()
	waitFor(t, time.Second, func() bool { _, err := os.Stat(filepath.Join(game.Directory, "count")); return err == nil })
	if err := app.BuildGame(game.ID); err == nil {
		t.Fatal("duplicate build allowed")
	}
	if _, err := app.SetGameLaunchMode(game.ID, "debug"); err == nil {
		t.Fatal("mode changed during build")
	}
	if err := app.RestartService(game.ID); err == nil {
		t.Fatal("restart allowed during build")
	}
	if err := app.ClearNextCache(game.ID); err == nil {
		t.Fatal("cache cleanup allowed during build")
	}
	if err := app.DeleteService(game.ID); err == nil {
		t.Fatal("deleted game during build")
	}
	if err := app.StopService(game.ID); err != nil {
		t.Fatal(err)
	}
	if serviceState(t, app, game.ID).Status != "stopped" || logContains(app.GetLogs(game.ID), "RELEASE") {
		t.Fatal("cancelled build launched or remained active")
	}
	data, _ := os.ReadFile(filepath.Join(game.Directory, "count"))
	if string(data) != "B\n" {
		t.Fatalf("duplicate builds: %q", data)
	}
}

func TestGameBuildManifestMigrationAndValidation(t *testing.T) {
	dir := t.TempDir()
	manifest := `{"buildCommand":"echo export", "releaseCommand":"dist/Game", "url":"http://localhost:18040"}`
	if err := os.WriteFile(filepath.Join(dir, ".lal.json"), []byte(manifest), 0o600); err != nil {
		t.Fatal(err)
	}
	config := configFile{Version: 7, Services: []Service{
		{ID: "game", Name: "Game", Module: moduleGame, Directory: dir, Command: "godot --path .", ReleaseCommand: "dist/Game", LaunchMode: "release"},
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
	if game := serviceState(t, app, "game"); game.BuildCommand != "echo export" || !game.BuildBeforeLaunch {
		t.Fatal("build migration missing")
	}
	if web := serviceState(t, app, "web"); web.BuildCommand != "" || web.BuildBeforeLaunch {
		t.Fatal("modified a service")
	}
	detected, err := app.DetectProject(dir)
	if err != nil || detected.BuildCommand != "echo export" || !detected.BuildBeforeLaunch {
		t.Fatalf("detection: %#v, %v", detected, err)
	}
	for _, input := range []ServiceInput{
		{Name: "Invalid", Module: moduleGame, Directory: dir, Command: "debug", BuildBeforeLaunch: true},
		{Name: "Invalid", Module: moduleService, Directory: dir, Command: "web", BuildCommand: "build"},
	} {
		if _, err := app.CreateService(input); err == nil {
			t.Fatal("invalid build settings accepted")
		}
	}
	if err := app.BuildGame("web"); err == nil {
		t.Fatal("built a service")
	}
	if err := os.WriteFile(filepath.Join(dir, ".lal.json"), []byte(`{"buildCommand":"echo export", "buildBeforeLaunch":false}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if command, before := detectedGameBuild(dir); command == "" || before {
		t.Fatal("explicit opt-out ignored")
	}
}
