package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

func isDirectory(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

type packageManifest struct {
	Dependencies    map[string]json.RawMessage `json:"dependencies"`
	DevDependencies map[string]json.RawMessage `json:"devDependencies"`
	Scripts         orderedScripts             `json:"scripts"`
	Name            string                     `json:"name"`
	Version         string                     `json:"version"`
	Description     string                     `json:"description"`
	PackageManager  string                     `json:"packageManager"`
}

func readPackageInfo(directory string) *PackageInfo {
	manifestPath := filepath.Join(directory, "package.json")
	info, err := os.Stat(manifestPath)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 2*1024*1024 {
		return nil
	}
	data, err := os.ReadFile(manifestPath)
	if err != nil || !utf8.Valid(data) {
		return nil
	}
	var manifest packageManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil
	}
	result := &PackageInfo{
		Name:           strings.TrimSpace(manifest.Name),
		Version:        strings.TrimSpace(manifest.Version),
		Description:    strings.TrimSpace(manifest.Description),
		PackageManager: strings.TrimSpace(manifest.PackageManager),
		Scripts:        make([]PackageScript, 0, len(manifest.Scripts.order)),
	}
	for _, name := range manifest.Scripts.order {
		result.Scripts = append(result.Scripts, PackageScript{Name: name, Command: manifest.Scripts.values[name]})
	}
	return result
}

var serviceIconExtensions = []string{".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif", ".ico"}

func detectServiceIcon(directory string) string {
	publicDir := filepath.Join(directory, "public")
	entries, err := os.ReadDir(publicDir)
	if err != nil {
		return ""
	}
	filesByName := make(map[string]string, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		filesByName[strings.ToLower(entry.Name())] = entry.Name()
	}
	for _, extension := range serviceIconExtensions {
		if filename, found := filesByName["logo"+extension]; found {
			return filepath.Join(publicDir, filename)
		}
	}
	return ""
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func detectProjectType(directory, command string) string {
	if isFile(filepath.Join(directory, "project.godot")) {
		return "godot"
	}
	if isFile(filepath.Join(directory, "ProjectSettings", "ProjectVersion.txt")) {
		return "unity"
	}
	hasPackageManifest := false
	manifestPath := filepath.Join(directory, "package.json")
	if data, err := os.ReadFile(manifestPath); err == nil && len(data) <= 2*1024*1024 {
		var manifest packageManifest
		if json.Unmarshal(data, &manifest) == nil {
			hasPackageManifest = true
			dependencies := make(map[string]struct{}, len(manifest.Dependencies)+len(manifest.DevDependencies))
			for name := range manifest.Dependencies {
				dependencies[name] = struct{}{}
			}
			for name := range manifest.DevDependencies {
				dependencies[name] = struct{}{}
			}
			for _, candidate := range []struct {
				projectType string
				packages    []string
			}{
				{projectType: "nextjs", packages: []string{"next"}},
				{projectType: "vite", packages: []string{"vite"}},
				{projectType: "angular", packages: []string{"@angular/core"}},
				{projectType: "vue", packages: []string{"vue"}},
				{projectType: "svelte", packages: []string{"svelte"}},
				{projectType: "phaser", packages: []string{"phaser"}},
				{projectType: "react", packages: []string{"react", "react-dom"}},
			} {
				for _, packageName := range candidate.packages {
					if _, found := dependencies[packageName]; found {
						return candidate.projectType
					}
				}
			}
			for _, script := range manifest.Scripts.values {
				if strings.Contains(strings.ToLower(script), "next") {
					return "nextjs"
				}
			}
		}
	}

	for _, filename := range []string{"next.config.js", "next.config.mjs", "next.config.ts"} {
		if isFile(filepath.Join(directory, filename)) {
			return "nextjs"
		}
	}
	if isDirectory(filepath.Join(directory, ".next")) || strings.Contains(strings.ToLower(command), "next") {
		return "nextjs"
	}
	if isFile(filepath.Join(directory, "go.mod")) {
		return "go"
	}
	if isFile(filepath.Join(directory, "Cargo.toml")) {
		return "rust"
	}
	if isFile(filepath.Join(directory, "pyproject.toml")) || isFile(filepath.Join(directory, "requirements.txt")) {
		return "python"
	}
	if hasPackageManifest {
		return "node"
	}
	return "generic"
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func cleanDirectory(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	return filepath.Clean(path)
}

func normalizeAccessURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	return strings.TrimRight(value, "/")
}

func normalizeCleanCommand(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultCleanCommand
	}
	return value
}

func pathWithin(root, path string) bool {
	relative, err := filepath.Rel(filepath.Clean(root), filepath.Clean(path))
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}
