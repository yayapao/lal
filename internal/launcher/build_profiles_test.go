package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBuildProfileRunsOnlySelectedCommand(t *testing.T) {
	app := testApp(t)
	game, err := app.CreateService(ServiceInput{
		Name: "Profiles", Module: moduleGame, Directory: t.TempDir(), Command: "echo DEBUG",
		BuildProfiles: []BuildProfile{{ID: "web-en", Name: "Web English", Command: "echo WEB > artifact; sleep 0.2"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.BuildGameProfile(game.ID, "web-en"); err != nil {
		t.Fatal(err)
	}
	view := serviceState(t, app, game.ID)
	if view.Status != "building" || view.ActiveBuildName != "Web English" || view.ActiveBuildCommand != game.BuildProfiles[0].Command {
		t.Fatalf("missing selected build state: %#v", view)
	}
	if err := app.BuildGameProfile(game.ID, "web-en"); err == nil {
		t.Fatal("concurrent profile build allowed")
	}
	waitFor(t, time.Second, func() bool { return serviceState(t, app, game.ID).Status == "built" })
	data, err := os.ReadFile(filepath.Join(game.Directory, "artifact"))
	if err != nil || string(data) != "WEB\n" || logContains(app.GetLogs(game.ID), "DEBUG") {
		t.Fatalf("wrong command or launched game: %q %v", data, err)
	}
	view = serviceState(t, app, game.ID)
	if view.ActiveBuildName != "" || view.ReleaseCommand != "" || view.BuildCommand != "" || view.LaunchMode != "" {
		t.Fatal("profile build changed startup settings or retained active state")
	}
	loaded := newAppWithConfigPath(app.configPath)
	if got := serviceState(t, loaded, game.ID); len(got.BuildProfiles) != 1 || got.BuildProfiles[0].ID != "web-en" {
		t.Fatal("profiles did not survive reload")
	}
	for _, id := range []string{"", "removed", "echo injected"} {
		if err := app.BuildGameProfile(game.ID, id); err == nil {
			t.Fatalf("accepted unknown profile %q", id)
		}
	}
}

func TestBuildProfileCancelAndFailureNeverLaunch(t *testing.T) {
	for _, cancel := range []bool{true, false} {
		t.Run(map[bool]string{true: "cancel", false: "failure"}[cancel], func(t *testing.T) {
			app := testApp(t)
			command := "exit 7"
			if cancel {
				command = "echo STARTED; sleep 30"
			}
			game, err := app.CreateService(ServiceInput{
				Name: "Profiles", Module: moduleGame, Directory: t.TempDir(), Command: "echo DEBUG",
				BuildCommand: "echo DEFAULT", BuildBeforeLaunch: true, ReleaseCommand: "echo RELEASE", LaunchMode: "release",
				BuildProfiles: []BuildProfile{{ID: "other", Name: "Other", Command: command}},
			})
			if err != nil {
				t.Fatal(err)
			}
			if err := app.BuildGameProfile(game.ID, "other"); err != nil {
				t.Fatal(err)
			}
			if cancel {
				waitFor(t, time.Second, func() bool { return logContains(app.GetLogs(game.ID), "STARTED") })
				if err := app.StopService(game.ID); err != nil {
					t.Fatal(err)
				}
			} else {
				waitFor(t, time.Second, func() bool { return serviceState(t, app, game.ID).Status == "failed" })
				if !strings.Contains(serviceState(t, app, game.ID).LastError, "[Other]") {
					t.Fatal("failure did not identify profile")
				}
			}
			if logContains(app.GetLogs(game.ID), "RELEASE") || logContains(app.GetLogs(game.ID), "DEFAULT") {
				t.Fatal("profile launched or invoked default build")
			}
		})
	}
}

func TestBuildProfilesDetectionMigrationAndValidation(t *testing.T) {
	dir := t.TempDir()
	profiles := []BuildProfile{{ID: "mac-zh", Name: "Mac Chinese", Command: "touch should-not-execute"}}
	manifest, _ := json.Marshal(lalProjectManifest{BuildProfiles: profiles})
	if err := os.WriteFile(filepath.Join(dir, lalManifestFilename), manifest, 0o600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "config.json")
	config, _ := json.Marshal(configFile{Version: 8, Services: []Service{{ID: "game", Name: "Game", Module: moduleGame,
		Directory: dir, Command: "debug", BuildCommand: "saved-build", ReleaseCommand: "saved-release"}}})
	if err := os.WriteFile(path, config, 0o600); err != nil {
		t.Fatal(err)
	}
	app := newAppWithConfigPath(path)
	if app.configWarn != "" {
		t.Fatal(app.configWarn)
	}
	game := serviceState(t, app, "game")
	if len(game.BuildProfiles) != 1 || game.BuildCommand != "saved-build" || game.ReleaseCommand != "saved-release" {
		t.Fatal("migration replaced saved commands or lost profiles")
	}
	detected, err := app.DetectProject(dir)
	if err != nil || len(detected.BuildProfiles) != 1 {
		t.Fatalf("detection: %#v, %v", detected, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "should-not-execute")); !os.IsNotExist(err) {
		t.Fatal("detection executed a command")
	}
	for _, invalid := range [][]BuildProfile{
		{{ID: "x", Name: "", Command: "build"}}, {{ID: "x", Name: "X", Command: " "}},
		{{ID: "bad id", Name: "X", Command: "build"}}, {{ID: "x", Name: strings.Repeat("字", 81), Command: "build"}},
		{{ID: "x", Name: "X", Command: strings.Repeat("b", 2001)}},
		{{ID: "x", Name: "X", Command: "build"}, {ID: "x", Name: "Y", Command: "build"}},
		{{ID: "x", Name: "X", Command: "build"}, {ID: "y", Name: "X", Command: "build"}},
		make([]BuildProfile, 17),
	} {
		if _, err := app.CreateService(ServiceInput{Name: "Invalid", Module: moduleGame, Directory: dir, Command: "debug", BuildProfiles: invalid}); err == nil {
			t.Fatalf("accepted invalid profiles: %#v", invalid)
		}
	}
	if _, err := app.CreateService(ServiceInput{Name: "Service", Module: moduleService, Directory: dir, Command: "web", BuildProfiles: profiles}); err == nil {
		t.Fatal("service accepted game profiles")
	}
	input := ServiceInput{Name: game.Name, Module: moduleGame, Directory: dir, Command: game.Command}
	if _, err := app.UpdateService(game.ID, input); err != nil {
		t.Fatal(err)
	}
	if got := serviceState(t, newAppWithConfigPath(path), game.ID); len(got.BuildProfiles) != 0 {
		t.Fatal("deleted profiles were reimported on reload")
	}
}
