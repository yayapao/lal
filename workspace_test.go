package main

import (
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
)

func TestWorkspaceCatalogKeepsEmptyGroups(t *testing.T) {
	app := testApp(t)
	if err := app.SaveWorkspaceLayout(WorkspaceLayout{Workspaces: []string{"Empty"}, Assignments: map[string]string{}}); err != nil {
		t.Fatal(err)
	}
	restored := newAppWithConfigPath(app.configPath)
	if !reflect.DeepEqual(restored.GetAppState().Workspaces, []string{"Empty"}) {
		t.Fatal("empty workspace lost on reload")
	}
	project, err := app.CreateService(ServiceInput{Name: "Alpha", Directory: t.TempDir(), Workspace: "Empty", Command: "echo start"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetServiceWorkspace(project.ID, ""); err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(app.GetAppState().Workspaces, "Empty") {
		t.Fatal("workspace disappeared when its last project moved out")
	}
}

func TestWorkspaceLayoutDeleteDoesNotReinferMembership(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	child, err := app.CreateService(ServiceInput{Name: "Child", Directory: filepath.Join(root, "child"), Workspace: "ViewAI", Command: "echo start"})
	if err != nil {
		t.Fatal(err)
	}
	parent, err := app.CreateService(ServiceInput{Name: "ViewAI", Directory: root, Workspace: "ViewAI", Command: "echo start"})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.SaveWorkspaceLayout(WorkspaceLayout{Workspaces: []string{}, Assignments: map[string]string{parent.ID: "", child.ID: ""}}); err != nil {
		t.Fatal(err)
	}
	restored := newAppWithConfigPath(app.configPath)
	if len(restored.GetAppState().Workspaces) != 0 {
		t.Fatal("deleted workspace reappeared")
	}
	for _, service := range restored.GetAppState().Services {
		if service.Workspace != "" || service.ConfiguredWorkspace != "" {
			t.Fatalf("project regrouped after deletion: %#v", service)
		}
	}
}

func TestWorkspaceLayoutUpdatesWhileRunning(t *testing.T) {
	app := testApp(t)
	project, err := app.CreateService(ServiceInput{Name: "Alpha", Directory: t.TempDir(), Workspace: "Old", Command: "sleep 30"})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(project.ID); err != nil {
		t.Fatal(err)
	}
	before := serviceState(t, app, project.ID)
	if err := app.SaveWorkspaceLayout(WorkspaceLayout{Workspaces: []string{"New"}, Assignments: map[string]string{project.ID: "New"}}); err != nil {
		t.Fatal(err)
	}
	after := serviceState(t, app, project.ID)
	if after.PID != before.PID || after.PID == 0 || after.Command != before.Command || after.Workspace != "New" {
		t.Fatalf("launch settings changed: %#v", after)
	}
}

func TestWorkspaceLayoutValidationAndRollback(t *testing.T) {
	app := testApp(t)
	project, err := app.CreateService(ServiceInput{Name: "Alpha", Directory: t.TempDir(), Workspace: "Old", Command: "echo start"})
	if err != nil {
		t.Fatal(err)
	}
	before := app.GetAppState()
	for _, input := range []WorkspaceLayout{
		{Workspaces: []string{"Duplicate", "Duplicate"}, Assignments: map[string]string{project.ID: ""}},
		{Workspaces: []string{"New"}, Assignments: map[string]string{project.ID: "Missing"}},
		{Workspaces: []string{"New"}, Assignments: map[string]string{"unknown": "New"}},
		{Workspaces: []string{"New"}, Assignments: map[string]string{}},
		{Workspaces: []string{"未分组"}, Assignments: map[string]string{project.ID: ""}},
	} {
		if err := app.SaveWorkspaceLayout(input); err == nil {
			t.Fatalf("invalid layout accepted: %#v", input)
		}
		if !reflect.DeepEqual(app.GetAppState(), before) {
			t.Fatal("validation failure changed state")
		}
	}
	badPath := filepath.Join(t.TempDir(), "directory")
	if err := os.Mkdir(badPath, 0o700); err != nil {
		t.Fatal(err)
	}
	app.configPath = badPath
	if err := app.SaveWorkspaceLayout(WorkspaceLayout{Workspaces: []string{"New"}, Assignments: map[string]string{project.ID: "New"}}); err == nil {
		t.Fatal("write failure was accepted")
	}
	after := app.GetAppState()
	if !reflect.DeepEqual(after.Workspaces, before.Workspaces) || !reflect.DeepEqual(after.Services, before.Services) {
		t.Fatal("failed save did not restore state")
	}
}
