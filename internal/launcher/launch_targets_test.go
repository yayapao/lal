package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func targetProject(t *testing.T, app *App) ServiceView {
	t.Helper()
	view, err := app.CreateService(ServiceInput{Name: "Monorepo", Directory: t.TempDir(), CleanCommand: "touch cleaned", LaunchTargets: []LaunchTarget{
		{ID: "web", Name: "Web", Command: "echo WEB; sleep 30", Default: true},
		{ID: "ppt", Name: "PPT", Command: "echo PPT; sleep 30"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	return view
}

func TestTargetsDefaultSelectionLifecycleAndLogs(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	if err := app.StartService(project.ID); err != nil {
		t.Fatal(err)
	}
	view := serviceState(t, app, project.ID)
	if view.Status != "running" || view.TargetViews[0].PID == 0 || view.TargetViews[1].PID != 0 {
		t.Fatalf("wrong default selection: %+v", view.TargetViews)
	}
	webPID := view.TargetViews[0].PID
	if err := app.StartLaunchTargets(project.ID, []string{"ppt"}); err != nil {
		t.Fatal(err)
	}
	if serviceState(t, app, project.ID).TargetViews[0].PID != webPID {
		t.Fatal("explicit selection restarted sibling")
	}
	waitFor(t, time.Second, func() bool { return logContains(app.GetLogs(project.ID), "[PPT] PPT") })
	if !logContains(app.GetLogs(project.ID+"::ppt"), "PPT") {
		t.Fatal("missing per-process logs")
	}
	found := false
	for _, entry := range app.GetLogs(project.ID) {
		if entry.TargetID == project.ID+"::ppt" {
			found = true
		}
	}
	if !found {
		t.Fatal("aggregate logs missing source")
	}
	if _, err := app.SetDefaultLaunchTargets(project.ID, []string{"ppt"}); err != nil {
		t.Fatal(err)
	}
	if err := app.RestartService(project.ID); err != nil {
		t.Fatal(err)
	}
	view = serviceState(t, app, project.ID)
	if view.TargetViews[0].PID == 0 || view.TargetViews[1].PID == 0 {
		t.Fatal("restart lost the running combination")
	}
	if err := app.StopService(project.ID + "::web"); err != nil {
		t.Fatal(err)
	}
	if err := app.ClearNextCache(project.ID); err != nil {
		t.Fatal(err)
	}
	view = serviceState(t, app, project.ID)
	if view.TargetViews[0].PID != 0 || view.TargetViews[1].PID == 0 {
		t.Fatal("cleanup changed active selection")
	}
	if _, err := os.Stat(filepath.Join(project.Directory, "cleaned")); err != nil {
		t.Fatal(err)
	}
	app.stopAllProcesses()
	if serviceState(t, app, project.ID).Status != "stopped" || app.runningCount() != 0 {
		t.Fatal("shutdown leaked child process")
	}
	reloaded := newAppWithConfigPath(app.configPath)
	if !reloaded.services[0].LaunchTargets[1].Default || reloaded.services[0].LaunchTargets[0].Default {
		t.Fatal("defaults not persisted")
	}
}

func TestTargetsRejectInvalidSelectionAndProtectRunningConfig(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	if err := app.StartLaunchTargets(project.ID, []string{"web", "missing"}); err == nil {
		t.Fatal("unknown selection allowed")
	}
	if app.runningCount() != 0 {
		t.Fatal("invalid selection partially started")
	}
	if err := app.StartService(project.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.UpdateService(project.ID, ServiceInput{Name: project.Name, Directory: project.Directory, Command: "true"}); err == nil {
		t.Fatal("edited running children")
	}
	if err := app.DeleteService(project.ID); err == nil {
		t.Fatal("deleted running children")
	}
	if _, err := app.SetDefaultLaunchTargets(project.ID, nil); err != nil {
		t.Fatal(err)
	}
	if err := app.StopService(project.ID); err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(project.ID); err == nil {
		t.Fatal("empty defaults launched fallback command")
	}
}

func TestTargetsBatchCompletesDefaultCombination(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	if _, err := app.SetDefaultLaunchTargets(project.ID, []string{"web", "ppt"}); err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(project.ID + "::web"); err != nil {
		t.Fatal(err)
	}
	result := app.StartAll()
	if result.Changed != 1 || len(result.Errors) > 0 {
		t.Fatalf("batch failed: %+v", result)
	}
	if len(app.GetAppState().Services) != 1 {
		t.Fatal("children became project cards")
	}
	if result := app.StopAll(); result.Changed != 1 || len(result.Errors) > 0 {
		t.Fatalf("stop failed: %+v", result)
	}
}

func TestTargetsDetectManifestAndValidate(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	targets := []LaunchTarget{{ID: "ppt", Name: "PPT", Command: "touch must-not-run", Default: true}}
	manifest, _ := json.Marshal(lalProjectManifest{LaunchTargets: targets, CleanCommand: "rm -rf apps/platform/.next"})
	if err := os.WriteFile(filepath.Join(dir, lalManifestFilename), manifest, 0o600); err != nil {
		t.Fatal(err)
	}
	detected, err := app.DetectProject(dir)
	if err != nil || len(detected.LaunchTargets) != 1 || detected.CleanCommand != "rm -rf apps/platform/.next" {
		t.Fatalf("detect failed: %+v %v", detected, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "must-not-run")); !os.IsNotExist(err) {
		t.Fatal("detection executed manifest")
	}
	for _, invalid := range [][]LaunchTarget{
		{{ID: "same", Name: "A", Command: "true"}, {ID: "same", Name: "B", Command: "true"}},
		{{ID: "bad::id", Name: "A", Command: "true"}},
		{{ID: "valid", Name: "A", Command: ""}},
		{{ID: "valid", Name: "A", Command: "true", URL: "file:///tmp"}},
	} {
		if _, err := app.CreateService(ServiceInput{Name: "Invalid", Directory: dir, LaunchTargets: invalid}); err == nil {
			t.Fatalf("allowed invalid targets: %+v", invalid)
		}
	}
}

func TestTargetsFailedChildDoesNotStopSibling(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	input := ServiceInput{Name: project.Name, Directory: project.Directory, LaunchTargets: append([]LaunchTarget(nil), project.LaunchTargets...)}
	input.LaunchTargets[1].Command, input.LaunchTargets[1].Default = "exit 7", true
	if _, err := app.UpdateService(project.ID, input); err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(project.ID); err != nil {
		t.Fatal(err)
	}
	waitFor(t, time.Second, func() bool { return serviceState(t, app, project.ID).TargetViews[1].Status == "failed" })
	view := serviceState(t, app, project.ID)
	if view.Status != "running" || view.TargetViews[0].PID == 0 || view.LastError == "" {
		t.Fatal("child failure hid sibling state")
	}
}
