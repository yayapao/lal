package launcher

import (
	"testing"
)

func TestProjectSurfacesUnavailableWatcher(t *testing.T) {
	app := testApp(t)
	project := targetProject(t, app)
	app.mu.Lock()
	service := app.services[0]
	child := targetService(service, service.LaunchTargets[1])
	process, err := app.launchProcessLocked(child, "sleep 30", "running")
	if err != nil {
		app.mu.Unlock()
		t.Fatal(err)
	}
	app.health[child.ID], app.healthInfo[child.ID] = "unreachable", "等待服务地址响应"
	app.mu.Unlock()
	app.watchLaunchedProcess(child, process, child.Command)
	view := serviceState(t, app, project.ID)
	if view.Status != "running" || view.Health != "unreachable" || view.LastError != "1 个进程不可用" {
		t.Fatalf("watcher failure hidden by project summary: %+v", view)
	}
	app.mu.Lock()
	app.health[child.ID], app.healthInfo[child.ID] = "ready", "服务已就绪"
	app.mu.Unlock()
	view = serviceState(t, app, project.ID)
	if view.Health != "ready" || view.LastError != "" {
		t.Fatal("recovered process remains in error")
	}
}
