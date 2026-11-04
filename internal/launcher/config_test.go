package launcher

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServiceConfigLifecycle(t *testing.T) {
	configPath := emptyConfig(t)
	projectDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(projectDir, defaultPromptsDir), 0o755); err != nil {
		t.Fatalf("create prompt directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(projectDir, defaultPromptsDir, "codex-startup.md"), []byte("Start this session"), 0o600); err != nil {
		t.Fatalf("write prompt: %v", err)
	}
	app := newAppWithConfigPath(configPath)
	if _, err := app.CreateService(ServiceInput{Name: "Invalid", Directory: " ", Command: "npm run dev"}); err == nil {
		t.Fatal("expected an empty directory to fail")
	}
	if _, err := app.CreateService(ServiceInput{Name: "Invalid URL", Directory: projectDir, Command: "npm run dev", URL: "file:///tmp"}); err == nil {
		t.Fatal("expected a non-http URL to fail")
	}

	created, err := app.CreateService(ServiceInput{
		Name:      "API",
		Directory: projectDir,
		Command:   "npm run dev",
		URL:       "localhost:4321/",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if created.ID == "" || created.Name != "API" || !created.PathExists || created.URL != "http://localhost:4321" || created.CleanCommand != defaultCleanCommand || len(created.PromptFiles) != 0 {
		t.Fatalf("unexpected created service: %#v", created)
	}
	if created.Module != moduleService {
		t.Fatalf("legacy service module = %q, want %q", created.Module, moduleService)
	}

	if _, err := app.CreateService(ServiceInput{Name: "api", Directory: projectDir, Command: "go run ."}); err == nil {
		t.Fatal("expected duplicate service name to fail")
	}

	updated, err := app.UpdateService(created.ID, ServiceInput{
		Name:         "Gateway",
		Directory:    projectDir,
		Command:      "go run .",
		URL:          "https://localhost:8443",
		CleanCommand: "rm -rf .next .turbo",
	})
	if err != nil {
		t.Fatalf("update service: %v", err)
	}
	if updated.Name != "Gateway" || updated.Command != "go run ." || updated.URL != "https://localhost:8443" || updated.CleanCommand != "rm -rf .next .turbo" {
		t.Fatalf("unexpected updated service: %#v", updated)
	}

	reloaded := newAppWithConfigPath(configPath).GetAppState()
	if len(reloaded.Services) != 1 || reloaded.Services[0].Name != "Gateway" || reloaded.Services[0].URL != "https://localhost:8443" || reloaded.Services[0].CleanCommand != "rm -rf .next .turbo" {
		t.Fatalf("service was not persisted: %#v", reloaded.Services)
	}

	if err := app.DeleteService(created.ID); err != nil {
		t.Fatalf("delete service: %v", err)
	}
	if services := newAppWithConfigPath(configPath).GetAppState().Services; len(services) != 0 {
		t.Fatalf("deleted service was persisted: %#v", services)
	}
}

func TestGameModulePersistsSeparately(t *testing.T) {
	configPath := emptyConfig(t)
	projectDir := t.TempDir()
	app := newAppWithConfigPath(configPath)
	game, err := app.CreateService(ServiceInput{
		Name: "Anti-Magic Gem", Module: moduleGame, Directory: projectDir, Command: "godot --path .", CleanCommand: "rm -rf .godot",
	})
	if err != nil {
		t.Fatalf("create game: %v", err)
	}
	if game.Module != moduleGame {
		t.Fatalf("game module = %q, want %q", game.Module, moduleGame)
	}
	reloaded := newAppWithConfigPath(configPath).GetAppState()
	if len(reloaded.Services) != 1 || reloaded.Services[0].Module != moduleGame || reloaded.Services[0].Command != "godot --path ." {
		t.Fatalf("game was not persisted: %#v", reloaded.Services)
	}
}

func TestServiceIDsRemainScopedToServicesModule(t *testing.T) {
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Web", Directory: t.TempDir(), Command: "true"})
	if err != nil {
		t.Fatal(err)
	}
	game, err := app.CreateService(ServiceInput{Name: "Game", Module: moduleGame, Directory: t.TempDir(), Command: "true"})
	if err != nil {
		t.Fatal(err)
	}
	if ids := app.serviceIDs(); len(ids) != 1 || ids[0] != service.ID {
		t.Fatalf("service ids = %#v, want only %s", ids, service.ID)
	}
	if ids := app.serviceIDsForModule(moduleGame); len(ids) != 1 || ids[0] != game.ID {
		t.Fatalf("game ids = %#v, want only %s", ids, game.ID)
	}
}

func TestVersionOneConfigPreservesConfiguredServiceURLs(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	legacy := configFile{Version: 1, Services: []Service{{
		ID:        "web",
		Name:      "Web",
		Directory: t.TempDir(),
		URL:       "http://localhost:3900",
		Command:   "npm run dev",
	}}}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy config: %v", err)
	}
	if err := os.WriteFile(configPath, data, 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	state := newAppWithConfigPath(configPath).GetAppState()
	if len(state.Services) != 1 || state.Services[0].URL != "http://localhost:3900" || state.Services[0].CleanCommand != defaultCleanCommand {
		t.Fatalf("configured URL was not preserved: %#v", state.Services)
	}
	updatedData, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read migrated config: %v", err)
	}
	var updated configFile
	if err := json.Unmarshal(updatedData, &updated); err != nil {
		t.Fatalf("unmarshal migrated config: %v", err)
	}
	if updated.Version != configVersion {
		t.Fatalf("config version = %d, want %d", updated.Version, configVersion)
	}
}

func TestServiceViewDetectsProjectTypeFromPackageManifest(t *testing.T) {
	configPath := emptyConfig(t)
	projectDir := t.TempDir()
	manifest := `{"name":"web","version":"1.2.3","description":"Test app","packageManager":"npm@10","dependencies":{"next":"15.0.0","react":"19.0.0"},"scripts":{"build":"next build","dev":"next dev"}}`
	if err := os.WriteFile(filepath.Join(projectDir, "package.json"), []byte(manifest), 0o600); err != nil {
		t.Fatalf("write package manifest: %v", err)
	}
	app := newAppWithConfigPath(configPath)
	service, err := app.CreateService(ServiceInput{Name: "Next app", Directory: projectDir, Command: "npm run dev"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if service.ProjectType != "nextjs" {
		t.Fatalf("project type = %q, want nextjs", service.ProjectType)
	}
	if service.PackageInfo == nil || service.PackageInfo.Name != "web" || service.PackageInfo.Version != "1.2.3" || service.PackageInfo.Description != "Test app" || service.PackageInfo.PackageManager != "npm@10" {
		t.Fatalf("unexpected package info: %#v", service.PackageInfo)
	}
	if len(service.PackageInfo.Scripts) != 2 || service.PackageInfo.Scripts[0].Name != "build" || service.PackageInfo.Scripts[0].Command != "next build" || service.PackageInfo.Scripts[1].Name != "dev" {
		t.Fatalf("unexpected package scripts: %#v", service.PackageInfo.Scripts)
	}
}

func TestServiceIconUsesProjectLogo(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	logoPath := filepath.Join(projectDir, "public", "logo.PNG")
	if err := os.MkdirAll(filepath.Dir(logoPath), 0o755); err != nil {
		t.Fatalf("create public directory: %v", err)
	}
	logo := []byte{0x89, 'P', 'N', 'G'}
	if err := os.WriteFile(logoPath, logo, 0o600); err != nil {
		t.Fatalf("write logo: %v", err)
	}
	service, err := app.CreateService(ServiceInput{Name: "Logo app", Directory: projectDir, Command: "exit 0"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if service.IconPath != logoPath {
		t.Fatalf("icon path = %q, want %q", service.IconPath, logoPath)
	}
	iconURL, err := app.GetServiceIcon(service.ID)
	if err != nil {
		t.Fatalf("get service icon: %v", err)
	}
	wantPrefix := "data:image/png;base64,"
	if iconURL != wantPrefix+base64.StdEncoding.EncodeToString(logo) {
		t.Fatalf("unexpected icon data URL: %q", iconURL)
	}
}

func TestLegacyWorkspaceGroupsMigrateToExplicitMembership(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "x-data")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	path := emptyConfig(t)
	legacy := configFile{Version: 4, Services: []Service{
		{ID: "parent", Name: "Studio", Directory: root, Command: "exit 0", CleanCommand: defaultCleanCommand},
		{ID: "child", Name: "XData", Directory: nested, Command: "exit 0", CleanCommand: defaultCleanCommand},
	}}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	app := newAppWithConfigPath(path)
	state := app.GetAppState()
	assertServiceNames(t, state.Services, []string{"Studio", "XData"})
	if state.Services[0].Workspace != "Studio" || state.Services[1].Workspace != "Studio" {
		t.Fatalf("unexpected workspaces: %#v", state.Services)
	}

	if _, err := app.UpdateService(state.Services[0].ID, ServiceInput{
		Name: "Studio", Workspace: "AI", Directory: root, Command: "exit 0",
	}); err != nil {
		t.Fatalf("update parent workspace: %v", err)
	}
	state = app.GetAppState()
	if state.Services[0].Workspace != "AI" || state.Services[1].Workspace != "Studio" {
		t.Fatalf("explicit memberships should change independently: %#v", state.Services)
	}
}

func TestFormatLogEntriesPrefixesEveryLine(t *testing.T) {
	formatted := formatLogEntries([]LogEntry{{
		Timestamp: "2026-08-27T15:30:45.123456+08:00",
		Stream:    "system",
		Text:      "端口被占用\n检查命令：lsof",
	}})
	if strings.Count(formatted, "[SYSTEM]") != 2 || !strings.Contains(formatted, "端口被占用") || !strings.Contains(formatted, "检查命令：lsof") {
		t.Fatalf("unexpected formatted log:\n%s", formatted)
	}
}
