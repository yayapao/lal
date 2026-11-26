package launcher

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const categoryStandalone = "standalone"
const categoryMonorepo = "monorepo"

func normalizeServiceCategory(value, module string, targets []LaunchTarget) string {
	if module == moduleGame {
		return ""
	}
	if len(targets) > 0 {
		return categoryMonorepo
	}
	if value = strings.ToLower(strings.TrimSpace(value)); value != "" {
		return value
	}
	return categoryStandalone
}

func jsonDeclaration(directory, filename string) map[string]json.RawMessage {
	var data map[string]json.RawMessage
	if json.Unmarshal([]byte(readDetectionText(filepath.Join(directory, filename))), &data) != nil {
		return nil
	}
	return data
}

func declaredPackages(raw json.RawMessage) bool {
	var paths []string
	if json.Unmarshal(raw, &paths) != nil {
		var object struct {
			Packages []string `json:"packages"`
		}
		if json.Unmarshal(raw, &object) != nil {
			return false
		}
		paths = object.Packages
	}
	for _, path := range paths {
		if path = strings.TrimSpace(path); path != "" && !strings.HasPrefix(path, "!") {
			return true
		}
	}
	return false
}

var pnpmPackages = regexp.MustCompile(`(?m)^packages:[ \t]*([^\r\n]*)`)

func hasPnpmPackages(text string) bool {
	match := pnpmPackages.FindStringSubmatchIndex(text)
	if match == nil {
		return false
	}
	value := strings.TrimSpace(strings.SplitN(text[match[2]:match[3]], "#", 2)[0])
	positive := func(path string) bool {
		path = strings.Trim(strings.TrimSpace(path), `"'`)
		return path != "" && !strings.HasPrefix(path, "!")
	}
	if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
		for _, path := range strings.Split(strings.TrimSuffix(strings.TrimPrefix(value, "["), "]"), ",") {
			if positive(path) {
				return true
			}
		}
		return false
	}
	if value != "" {
		return false
	}
	for _, line := range strings.Split(text[match[1]:], "\n") {
		trimmed := strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "- ") {
			if positive(strings.TrimPrefix(trimmed, "- ")) {
				return true
			}
		} else if line[0] != ' ' && line[0] != '\t' {
			break
		}
	}
	return false
}

func applyMonorepoDetection(result *ProjectDetection) {
	result.Category = categoryStandalone
	add := func(source, evidence string) {
		result.MonorepoEvidence = append(result.MonorepoEvidence, evidence)
		addDetectionSource(&result.Sources, source)
	}
	if len(result.LaunchTargets) > 0 {
		add(lalManifestFilename, fmt.Sprintf(".lal.json 声明了 %d 个项目进程", len(result.LaunchTargets)))
	}
	if declaredPackages(jsonDeclaration(result.Directory, "package.json")["workspaces"]) {
		add("package.json", "package.json 声明了 workspaces")
	}
	if hasPnpmPackages(readDetectionText(filepath.Join(result.Directory, "pnpm-workspace.yaml"))) {
		add("pnpm-workspace.yaml", "pnpm-workspace.yaml 声明了 packages")
	}
	if declaredPackages(jsonDeclaration(result.Directory, "lerna.json")["packages"]) {
		add("lerna.json", "lerna.json 声明了 packages")
	}
	// A task runner alone can also belong to a single application. Require
	// multiple package/project manifests before using it as structural evidence.
	for _, file := range []string{"turbo.json", "nx.json"} {
		if len(jsonDeclaration(result.Directory, file)) > 0 && hasMultiplePackages(result.Directory) {
			add(file, file+" 与多个子项目配置")
		}
	}
	if len(result.MonorepoEvidence) > 0 {
		result.Category = categoryMonorepo
	}
}

func hasMultiplePackages(directory string) bool {
	count := 0
	for _, parent := range []string{"apps", "packages", "services"} {
		entries, _ := os.ReadDir(filepath.Join(directory, parent))
		for _, entry := range entries {
			if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			child := filepath.Join(directory, parent, entry.Name())
			if len(jsonDeclaration(child, "package.json")) > 0 || len(jsonDeclaration(child, "project.json")) > 0 {
				count++
				if count >= 2 {
					return true
				}
			}
		}
	}
	return false
}
