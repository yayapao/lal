package launcher

import (
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func godotWebFixture(t *testing.T, app *App, address string) ServiceView {
	t.Helper()
	directory := t.TempDir()
	export := filepath.Join(directory, "dist", "web")
	if err := os.MkdirAll(export, 0o755); err != nil {
		t.Fatal(err)
	}
	for path, content := range map[string]string{
		"project.godot": "[application]\nconfig/name=\"Test\"",
		"export_presets.cfg": "[preset.0]\nname=\"Desktop\"\nplatform=\"macOS\"\nexport_path=\"dist/Game.app\"\n" +
			"[preset.1]\nname=\"Web Game\"\nplatform=\"Web\"\nrunnable=true\nexport_path=\"dist/web/play.html\"\n" +
			"[preset.1.options]\nexport_path=\"wrong.html\"\n",
		"dist/web/play.html": "<html>Game</html>",
		"dist/web/game.wasm": "\x00asm",
		"dist/web/game.pck":  "pack",
	} {
		if err := os.WriteFile(filepath.Join(directory, path), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	service, err := app.CreateService(ServiceInput{Name: "Godot", Module: moduleGame, Directory: directory, Command: "sleep 30", URL: address})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func TestGodotWebServesExportAndStopsIndependently(t *testing.T) {
	app := testApp(t)
	service := godotWebFixture(t, app, "")
	if !service.GodotWeb.Available || service.GodotWeb.Status != "stopped" || service.GodotWeb.Preset != "Web Game" {
		t.Fatalf("export not detected: %+v", service.GodotWeb)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatal(err)
	}
	if err := app.StartGodotWeb(service.ID); err != nil {
		t.Fatal(err)
	}
	web := serviceState(t, app, service.ID).GodotWeb
	if err := app.StartGodotWeb(service.ID); err != nil || serviceState(t, app, service.ID).GodotWeb.URL != web.URL {
		t.Fatal("duplicate start changed the server")
	}
	for path, mime := range map[string]string{"/play.html": "text/html", "/game.wasm": "application/wasm", "/game.pck": "application/octet-stream"} {
		response, err := http.Get(web.URL[:strings.LastIndex(web.URL, "/")] + path)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(io.Discard, response.Body)
		response.Body.Close()
		if response.StatusCode != 200 || !strings.HasPrefix(response.Header.Get("Content-Type"), mime) ||
			response.Header.Get("Cross-Origin-Embedder-Policy") != "require-corp" || response.Header.Get("Cache-Control") != "no-store" {
			t.Fatalf("invalid Godot response: %s %v", response.Status, response.Header)
		}
	}
	if err := app.StopService(service.ID); err != nil {
		t.Fatal(err)
	}
	if serviceState(t, app, service.ID).GodotWeb.Status != "running" {
		t.Fatal("stopping the native game stopped the browser server")
	}
	if err := app.StopGodotWeb(service.ID); err != nil {
		t.Fatal(err)
	}
	if view := serviceState(t, app, service.ID); view.Status != "stopped" || view.GodotWeb.Status != "stopped" || view.GodotWeb.URL != "" {
		t.Fatalf("stop left stale status: %+v", view)
	}
	if response, err := http.Get(web.URL); err == nil {
		response.Body.Close()
		t.Fatal("server still accepts connections after stop")
	}
}

func TestGodotWebMissingExportAndPortConflictRecover(t *testing.T) {
	app := testApp(t)
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	service := godotWebFixture(t, app, "http://"+listener.Addr().String()+"/index.html")
	entry := service.GodotWeb.EntryPath
	os.Remove(entry)
	if err := app.StartGodotWeb(service.ID); err == nil || !strings.Contains(err.Error(), "尚未导出") {
		t.Fatalf("missing export error: %v", err)
	}
	os.WriteFile(entry, []byte("game"), 0o600)
	if err := app.StartGodotWeb(service.ID); err == nil || !strings.Contains(err.Error(), "端口已被占用") {
		t.Fatalf("port conflict error: %v", err)
	}
	if view := serviceState(t, app, service.ID); view.GodotWeb.Status != "failed" || view.Status != "stopped" {
		t.Fatalf("browser failure changed native status: %+v", view)
	}
	listener.Close()
	if err := app.StartGodotWeb(service.ID); err != nil {
		t.Fatal(err)
	}
	if view := serviceState(t, app, service.ID).GodotWeb; view.Status != "running" || view.LastError != "" {
		t.Fatalf("restart left stale failure: %+v", view)
	}
}

func TestGodotWebProtectsActiveExportAndCleansUpOnQuit(t *testing.T) {
	app := testApp(t)
	service := godotWebFixture(t, app, "")
	if err := app.StartGodotWeb(service.ID); err != nil {
		t.Fatal(err)
	}
	if !HasRunningProcesses(app) {
		t.Fatal("browser service must be included in quit confirmation")
	}
	if err := app.BuildGame(service.ID); err == nil {
		t.Fatal("build allowed while serving the export")
	}
	if _, err := app.UpdateService(service.ID, ServiceInput{Name: "Changed", Module: moduleGame, Directory: service.Directory, Command: service.Command}); err == nil {
		t.Fatal("edit allowed while browser server is active")
	}
	if err := app.DeleteService(service.ID); err == nil {
		t.Fatal("delete allowed while browser server is active")
	}
	var wg sync.WaitGroup
	for range 6 {
		wg.Go(func() { _ = app.StartGodotWeb(service.ID); _ = app.StopGodotWeb(service.ID) })
	}
	wg.Wait()
	if err := app.StartGodotWeb(service.ID); err != nil {
		t.Fatal(err)
	}
	Shutdown(app)
	if serviceState(t, app, service.ID).GodotWeb.Status != "stopped" {
		t.Fatal("quit left browser service running")
	}
	if err := app.StartGodotWeb(service.ID); err == nil {
		t.Fatal("browser server started during shutdown")
	}
}

func TestGodotWebDeniesExportEscapesAndDirectoryListings(t *testing.T) {
	app := testApp(t)
	service := godotWebFixture(t, app, "")
	root := filepath.Dir(service.GodotWeb.EntryPath)
	secret := filepath.Join(t.TempDir(), "secret.txt")
	os.WriteFile(secret, []byte("secret"), 0o600)
	os.Symlink(secret, filepath.Join(root, "outside.txt"))
	if err := app.StartGodotWeb(service.ID); err != nil {
		t.Fatal(err)
	}
	web := serviceState(t, app, service.ID).GodotWeb
	for _, path := range []string{"/", "/outside.txt", "/missing.wasm"} {
		response, err := http.Get(web.URL[:strings.LastIndex(web.URL, "/")] + path)
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(response.Body)
		response.Body.Close()
		if response.StatusCode == 200 || strings.Contains(string(data), "secret") {
			t.Fatalf("export escaped: %s %s", path, data)
		}
	}
}
