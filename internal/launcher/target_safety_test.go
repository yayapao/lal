package launcher

import (
	"net"
	"testing"
	"time"
)

func TestTargetConflictPreservesExternalListenerAndSibling(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	app := testApp(t)
	project := targetProject(t, app)
	input := ServiceInput{Name: project.Name, Directory: project.Directory, LaunchTargets: append([]LaunchTarget(nil), project.LaunchTargets...)}
	input.LaunchTargets[1].URL = "http://" + listener.Addr().String()
	input.LaunchTargets[1].Default = true
	if _, err := app.UpdateService(project.ID, input); err != nil {
		t.Fatal(err)
	}
	if err := app.StartService(project.ID); err == nil {
		t.Fatal("occupied target was launched")
	}
	view := serviceState(t, app, project.ID)
	if view.TargetViews[0].PID == 0 || view.TargetViews[1].Status != "failed" || view.TargetViews[1].Port == nil {
		t.Fatalf("conflict hidden: %+v", view.TargetViews)
	}
	if err := app.StopService(project.ID); err != nil {
		t.Fatal(err)
	}
	connection, err := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if err != nil {
		t.Fatal("stopped foreign listener")
	}
	connection.Close()
}

func TestTargetResourcesAggregateAndShutdownBlocksHandoff(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	if err := app.StartLaunchTargets(project.ID, []string{"web", "ppt"}); err != nil {
		t.Fatal(err)
	}
	usage, err := app.GetResourceUsage()
	if err != nil {
		t.Fatal(err)
	}
	if resourceState(t, usage, project.ID).ProcessCount < 2 {
		t.Fatalf("child resources not aggregated: %+v", usage)
	}
	// Model exit during a project operation: shutdown must stop owned groups
	// even while normal UI operations are protected by the project reservation.
	app.mu.Lock()
	app.targetBusy[project.ID] = true
	app.mu.Unlock()
	app.stopAllProcesses()
	app.mu.Lock()
	delete(app.targetBusy, project.ID)
	app.mu.Unlock()
	if app.runningCount() != 0 {
		t.Fatal("shutdown left a child running")
	}
	if err := app.StartLaunchTargets(project.ID, []string{"ppt"}); err == nil {
		t.Fatal("launch allowed after shutdown")
	}
}

func TestTargetOperationsReserveProjectUntilCleanupFinishes(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	input := ServiceInput{Name: project.Name, Directory: project.Directory, LaunchTargets: project.LaunchTargets,
		CleanCommand: "touch cleaning; sleep 0.2"}
	if _, err := app.UpdateService(project.ID, input); err != nil {
		t.Fatal(err)
	}
	// Reserve directly, as the cleanup wrapper does, to assert the same lock
	// protects edits, deletion and a concurrent start before any child exists.
	err := app.withProjectOperation(project.ID, func(Service) error {
		if _, err := app.UpdateService(project.ID, input); err == nil {
			t.Fatal("edited reserved project")
		}
		if err := app.DeleteService(project.ID); err == nil {
			t.Fatal("deleted reserved project")
		}
		if err := app.StartLaunchTargets(project.ID, []string{"ppt"}); err == nil {
			t.Fatal("concurrent start allowed")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
