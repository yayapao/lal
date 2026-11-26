package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMonorepoDetectionEvidence(t *testing.T) {
	for _, test := range []struct {
		name, file, text   string
		children, monorepo bool
	}{
		{"npm workspaces", "package.json", `{"workspaces":["apps/*"],"scripts":{"dev":"npm run web"}}`, false, true},
		{"yarn packages", "package.json", `{"workspaces":{"packages":["packages/*"]}}`, false, true},
		{"pnpm block", "pnpm-workspace.yaml", "packages:\n  # applications\n  - 'apps/*'\n  - '!**/test'\n", false, true},
		{"pnpm inline", "pnpm-workspace.yaml", `packages: ['apps/*', 'packages/*']`, false, true},
		{"lerna packages", "lerna.json", `{"packages":["modules/*"]}`, false, true},
		{"turbo packages", "turbo.json", `{"tasks":{"dev":{"persistent":true}}}`, true, true},
		{"nx packages", "nx.json", `{"targetDefaults":{"build":{}}}`, true, true},
		{"explicit processes", ".lal.json", `{"launchTargets":[{"id":"web","name":"Web","command":"npm run dev","default":true}]}`, false, true},
		{"single app turbo", "turbo.json", `{"tasks":{"build":{}}}`, false, false},
		{"directories alone", "package.json", `{"name":"root"}`, true, false},
		{"empty workspaces", "package.json", `{"workspaces":[]}`, false, false},
		{"empty pnpm", "pnpm-workspace.yaml", "packages: []\n", false, false},
		{"blank pnpm", "pnpm-workspace.yaml", "packages: ['']\n", false, false},
		{"excluded only", "pnpm-workspace.yaml", "packages:\n  - '!apps/*'\n", false, false},
		{"other pnpm list", "pnpm-workspace.yaml", "packages:\nother:\n  - apps/*\n", false, false},
		{"invalid config", "nx.json", `{invalid}`, true, false},
		{"URL alone", ".lal.json", `{"url":"http://localhost:3000"}`, false, false},
		{"invalid processes", ".lal.json", `{"launchTargets":[{"id":"web"}]}`, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			writeDetectionFile(t, directory, test.file, test.text)
			if test.children {
				writeDetectionFile(t, directory, "apps/web/package.json", `{"name":"web"}`)
				writeDetectionFile(t, directory, "services/api/project.json", `{"name":"api"}`)
			}
			result, err := testApp(t).DetectProject(directory)
			if err != nil {
				t.Fatal(err)
			}
			if (result.Category == categoryMonorepo) != test.monorepo || (len(result.MonorepoEvidence) > 0) != test.monorepo {
				t.Fatalf("unexpected classification: %#v", result)
			}
			if test.monorepo && !strings.Contains(strings.Join(result.MonorepoEvidence, ";"), test.file) {
				t.Fatalf("missing concrete evidence: %#v", result.MonorepoEvidence)
			}
			if test.file != ".lal.json" && len(result.LaunchTargets) > 0 {
				t.Fatal("structural detection must not invent launch commands")
			}
		})
	}
}

func TestProjectCategoryMigrationAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	services := []Service{
		{ID: "plain", Name: "Plain", Module: moduleService, Directory: t.TempDir(), Command: "echo plain"},
		{ID: "mono", Name: "Mono", Module: moduleService, Directory: t.TempDir(), LaunchTargets: []LaunchTarget{{ID: "web", Name: "Web", Command: "echo web"}}},
	}
	data, _ := json.Marshal(configFile{Version: 10, Services: services})
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	app := newAppWithConfigPath(path)
	state := app.GetAppState()
	if state.Warning != "" || state.Services[1].Category != categoryStandalone || state.Services[0].Category != categoryMonorepo {
		t.Fatalf("migration failed: %#v", state)
	}
	created, err := app.CreateService(ServiceInput{Name: "Z Workspace", Category: categoryMonorepo, Directory: t.TempDir(), Command: "npm run dev"})
	if err != nil {
		t.Fatal(err)
	}
	reloaded := newAppWithConfigPath(path).GetAppState()
	if reloaded.Services[2].Category != categoryMonorepo || len(reloaded.Services[2].LaunchTargets) != 0 {
		t.Fatalf("category without processes was lost: %#v", reloaded.Services[2])
	}
	if _, err := app.UpdateService(created.ID, ServiceInput{Name: "Z Workspace", Category: categoryStandalone, Directory: created.Directory, Command: created.Command}); err != nil {
		t.Fatal(err)
	}
	if app.GetAppState().Services[2].Category != categoryStandalone {
		t.Fatal("manual reclassification failed")
	}
}
