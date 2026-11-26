package launcher

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGodotWebDetectionHandlesAbsentAndMultiplePresets(t *testing.T) {
	directory := t.TempDir()
	if view := detectGodotWeb(directory); view.Available || !strings.Contains(view.LastError, "添加 Web 导出预设") {
		t.Fatalf("missing preset: %+v", view)
	}
	path := filepath.Join(directory, "export_presets.cfg")
	os.WriteFile(path, []byte("[preset.0]\nplatform=\"Web\"\nexport_path=\"\"\n"), 0o600)
	if view := detectGodotWeb(directory); view.Available || !strings.Contains(view.LastError, "HTML 导出路径") {
		t.Fatalf("empty export path: %+v", view)
	}
	os.WriteFile(path, []byte("[preset.0]\nplatform=\"Web\"\nrunnable=false\nexport_path=\"other.html\"\n"+
		"[preset.1]\nplatform=\"Web\"\nrunnable=true\nexport_path=\"中文 游戏.html\"\n"), 0o600)
	entry := filepath.Join(directory, "中文 游戏.html")
	os.WriteFile(entry, []byte("game"), 0o600)
	if view := detectGodotWeb(directory); !view.Available || view.EntryPath != entry {
		t.Fatalf("runnable preset not selected: %+v", view)
	}
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Not Godot", Module: moduleGame, Directory: directory, Command: "sleep 30"})
	if err != nil {
		t.Fatal(err)
	}
	if service.GodotWeb != nil || app.StartGodotWeb(service.ID) == nil {
		t.Fatal("non-Godot game accepted by browser service")
	}
}

func TestGodotWebUnexpectedListenerFailureUpdatesState(t *testing.T) {
	app := testApp(t)
	service := godotWebFixture(t, app, "")
	root, err := os.OpenRoot(filepath.Dir(service.GodotWeb.EntryPath))
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		root.Close()
		t.Fatal(err)
	}
	session := &godotWebSession{server: &http.Server{}, view: *service.GodotWeb, done: make(chan struct{})}
	session.view.Status = "running"
	app.mu.Lock()
	app.godotWeb[service.ID] = session
	app.mu.Unlock()
	listener.Close()
	go app.serveGodotWeb(service.ID, session, listener, root)
	<-session.done
	if view := serviceState(t, app, service.ID).GodotWeb; view.Status != "failed" || view.URL != "" || view.LastError == "" {
		t.Fatalf("unexpected server failure was hidden: %+v", view)
	}
}

func TestGodotWebExternalStateRequiresConfiguredPreviewAndConnectivity(t *testing.T) {
	for _, test := range []struct{ matches, accessible, preview bool }{{true, true, true}, {false, true, true}, {true, false, true}, {true, true, false}} {
		view := ServiceView{Service: Service{URL: "http://127.0.0.1:18040/index.html"}, GodotWeb: &GodotWebView{Status: "stopped"},
			Port: &PortView{MatchesProject: test.matches, Accessible: test.accessible, PreviewOnly: test.preview}}
		applyGodotWebExternal(&view)
		if (view.GodotWeb.Status == "external") != (test.accessible && test.preview) {
			t.Fatalf("incorrect external status: %+v %+v", test, view.GodotWeb)
		}
	}
}
