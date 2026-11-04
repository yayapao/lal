package launcher

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func writeDetectionFile(t *testing.T, directory, name, text string) {
	t.Helper()
	path := filepath.Join(directory, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDetectProjectCommandsAndPorts(t *testing.T) {
	for _, test := range []struct {
		name, manifest, extraName, extra, command, url, clean string
	}{
		{"next", `{"name":"niu","scripts":{"build":"next build","dev":"next dev --port 35790"},"dependencies":{"next":"16"}}`, "", "", "npm run dev", "http://localhost:35790", defaultCleanCommand},
		{"pnpm", `{"name":"@team/app","packageManager":"pnpm@10.0.0","scripts":{"dev":"next dev --hostname 127.0.0.1 -p 60309","clean":"rm -rf .next"}}`, "", "", "pnpm run dev", "http://127.0.0.1:60309", "pnpm run clean"},
		{"yarn lock", `{"scripts":{"start":"react-scripts start"}}`, "yarn.lock", "", "yarn run start", "http://localhost:3000", defaultCleanCommand},
		{"bun env", `{"packageManager":"bun@1.2","scripts":{"dev":"PORT=4567 next dev"}}`, "", "", "bun run dev", "http://localhost:4567", defaultCleanCommand},
		{"vite config", `{"scripts":{"dev":"vite"},"devDependencies":{"vite":"7"}}`, "vite.config.ts", `export default {preview: {port: 9999}, server: {port: 4188}}`, "npm run dev", "http://localhost:4188", "rm -rf node_modules/.vite"},
		{"vite default", `{"scripts":{"dev":"vite --host 0.0.0.0"},"devDependencies":{"vite":"7"}}`, "", "", "npm run dev", "http://localhost:5173", "rm -rf node_modules/.vite"},
		{"script alias", `{"scripts":{"dev":"npm run serve","serve":"next dev --port=4455 --experimental-https"}}`, "", "", "npm run dev", "https://localhost:4455", defaultCleanCommand},
		{"node source", `{"scripts":{"start":"node scripts/server.mjs"}}`, "scripts/server.mjs", `const port = process.env.PORT || 3900; server.listen(port);`, "npm run start", "http://localhost:3900", defaultCleanCommand},
		{"unknown port", `{"scripts":{"dev":"node server.js"}}`, "server.js", `server.listen(getPort());`, "npm run dev", "", defaultCleanCommand},
		{"dynamic vite", `{"scripts":{"dev":"vite"}}`, "vite.config.ts", `export default {server: {port: Number(process.env.WEB_PORT)}}`, "npm run dev", "", defaultCleanCommand},
		{"dynamic next", `{"scripts":{"dev":"next dev --port $WEB_PORT"}}`, "", "", "npm run dev", "", defaultCleanCommand},
		{"serve listen", `{"scripts":{"serve":"serve dist -l 18040"}}`, "", "", "npm run serve", "http://localhost:18040", defaultCleanCommand},
		{"python server", `{"scripts":{"dev":"python3 -m http.server 8000 --bind 127.0.0.1"}}`, "", "", "npm run dev", "http://127.0.0.1:8000", defaultCleanCommand},
		{"invalid port", `{"scripts":{"dev":"next dev --port 99999"}}`, "", "", "npm run dev", "", defaultCleanCommand},
		{"no launch", `{"scripts":{"build":"next build","lint":"eslint"}}`, "", "", "", "", defaultCleanCommand},
	} {
		t.Run(test.name, func(t *testing.T) {
			app := testApp(t)
			directory := t.TempDir()
			writeDetectionFile(t, directory, "package.json", test.manifest)
			if test.extraName != "" {
				writeDetectionFile(t, directory, test.extraName, test.extra)
			}
			result, err := app.DetectProject(directory)
			if err != nil {
				t.Fatal(err)
			}
			if result.Command != test.command || result.URL != test.url || result.CleanCommand != test.clean {
				t.Fatalf("unexpected detection: %#v", result)
			}
			if !slices.Contains(result.Sources, "package.json") {
				t.Fatalf("missing metadata source: %#v", result)
			}
			if len(app.GetAppState().Services) != 0 {
				t.Fatal("detection must not register a service")
			}
		})
	}
}

func TestDetectProjectWorkspaceAndScriptAlternatives(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	if _, err := app.CreateService(ServiceInput{Name: "Parent", Workspace: "Studio", Directory: root, Command: "echo start"}); err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(root, "child")
	writeDetectionFile(t, directory, "package.json", `{"name":"child","scripts":{"dev":"next dev -p 3001","start":"next start -p 3002"}}`)
	result, err := app.DetectProject(directory)
	if err != nil || result.Name != "child" || result.Workspace != "Studio" || result.Scripts[1].URL != "http://localhost:3002" {
		t.Fatalf("unexpected detection: %#v, %v", result, err)
	}
}

func TestDetectProjectFallbacks(t *testing.T) {
	app := testApp(t)
	if _, err := app.DetectProject(""); err == nil {
		t.Fatal("empty path accepted")
	}
	if _, err := app.DetectProject(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("missing path accepted")
	}
	directory := t.TempDir()
	writeDetectionFile(t, directory, "package.json", "invalid JSON")
	result, err := app.DetectProject(directory)
	if err != nil || result.Name != filepath.Base(directory) || result.Command != "" || len(result.Warnings) == 0 {
		t.Fatalf("unexpected fallback: %#v, %v", result, err)
	}
	// Executable configuration is only inspected as text, never imported.
	writeDetectionFile(t, directory, "package.json", `{"scripts":{"dev":"vite"}}`)
	writeDetectionFile(t, directory, "vite.config.js", `require('fs').writeFileSync('executed', 'yes'); export default {server: {port: 3456}}`)
	if _, err := app.DetectProject(directory); err != nil {
		t.Fatal(err)
	}
	if isFile(filepath.Join(directory, "executed")) {
		t.Fatal("project config was executed")
	}
}

func TestDetectGodotGameProject(t *testing.T) {
	app := testApp(t)
	directory := t.TempDir()
	writeDetectionFile(t, directory, "project.godot", `config_version=5

[application]

config/name="Anti-Magic Gem"
run/main_scene="res://scenes/main.tscn"
`)
	result, err := app.DetectProject(directory)
	if err != nil {
		t.Fatal(err)
	}
	if result.Name != "Anti-Magic Gem" || result.ProjectType != "godot" || !strings.Contains(result.Command, "--path .") {
		t.Fatalf("unexpected Godot detection: %#v", result)
	}
	if result.CleanCommand != "rm -rf .godot" || !slices.Contains(result.Sources, "project.godot") {
		t.Fatalf("unexpected Godot metadata: %#v", result)
	}
}

func TestDetectProjectManifestURL(t *testing.T) {
	app := testApp(t)
	directory := t.TempDir()
	writeDetectionFile(t, directory, "project.godot", `config_version=5

[application]

config/name="Anti-Magic Gem"
`)
	writeDetectionFile(t, directory, lalManifestFilename, `{"url":"127.0.0.1:18040/index.html/"}`)
	result, err := app.DetectProject(directory)
	if err != nil {
		t.Fatal(err)
	}
	if result.URL != "http://127.0.0.1:18040/index.html" {
		t.Fatalf("manifest URL = %q", result.URL)
	}
	if !slices.Contains(result.Sources, lalManifestFilename) {
		t.Fatalf("manifest source missing: %#v", result.Sources)
	}
}

func TestDetectProjectManifestTakesPrecedenceAndReportsInvalidURL(t *testing.T) {
	app := testApp(t)
	directory := t.TempDir()
	writeDetectionFile(t, directory, "package.json", `{"scripts":{"dev":"next dev --port 3000"}}`)
	writeDetectionFile(t, directory, lalManifestFilename, `{"url":"http://localhost:18040/index.html"}`)
	result, err := app.DetectProject(directory)
	if err != nil || result.URL != "http://localhost:18040/index.html" || result.Scripts[0].URL != result.URL {
		t.Fatalf("manifest did not take precedence: %#v, %v", result, err)
	}
	writeDetectionFile(t, directory, lalManifestFilename, `{"url":"/index.html"}`)
	result, err = app.DetectProject(directory)
	if err != nil || result.URL != "http://localhost:3000" || len(result.Warnings) == 0 {
		t.Fatalf("invalid manifest should fall back: %#v, %v", result, err)
	}
}
