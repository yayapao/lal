package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRunPackageScriptIsIndependentOfServiceProcess(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	manifest := `{"name":"scripts","scripts":{"hello":"echo package script ran"}}`
	if err := os.WriteFile(filepath.Join(projectDir, "package.json"), []byte(manifest), 0o600); err != nil {
		t.Fatalf("write package manifest: %v", err)
	}
	service, err := app.CreateService(ServiceInput{Name: "Scripts", Directory: projectDir, Command: "exit 0"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.RunPackageScript(service.ID, "hello"); err != nil {
		t.Fatalf("run package script: %v", err)
	}
	if err := app.RunPackageScript(service.ID, "hello"); err == nil {
		t.Fatal("expected concurrent package script to fail")
	}
	waitFor(t, 3*time.Second, func() bool {
		for _, current := range app.GetAppState().Services {
			if current.ID == service.ID {
				return current.ScriptStatus == "completed"
			}
		}
		return false
	})
	if _, running := app.scriptProcesses[service.ID]; running {
		t.Fatal("package script process was not removed")
	}
	if !logContains(app.GetLogs(service.ID), "package script ran") {
		t.Fatalf("script output missing in logs: %#v", app.GetLogs(service.ID))
	}
}
