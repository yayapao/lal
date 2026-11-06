package launcher

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ProjectScript struct {
	Name    string `json:"name"`
	Command string `json:"command"`
	Preview string `json:"preview"`
	URL     string `json:"url"`
}

type ProjectDetection struct {
	Directory      string          `json:"directory"`
	Name           string          `json:"name"`
	Workspace      string          `json:"workspace"`
	ProjectType    string          `json:"projectType"`
	Command        string          `json:"command"`
	ReleaseCommand string          `json:"releaseCommand"`
	URL            string          `json:"url"`
	CleanCommand   string          `json:"cleanCommand"`
	Scripts        []ProjectScript `json:"scripts"`
	Sources        []string        `json:"sources"`
	Warnings       []string        `json:"warnings"`
}

// DetectProject reads project metadata without running scripts or config files.
func (m *serviceManager) DetectProject(directory string) (ProjectDetection, error) {
	directory = strings.TrimSpace(directory)
	if directory == "" {
		return ProjectDetection{}, fmt.Errorf("请先选择项目目录")
	}
	if directory == "~" || strings.HasPrefix(directory, "~/") {
		if homeDirectory, err := os.UserHomeDir(); err == nil {
			if directory == "~" {
				directory = homeDirectory
			} else {
				directory = filepath.Join(homeDirectory, strings.TrimPrefix(directory, "~/"))
			}
		}
	}
	directory, err := filepath.Abs(directory)
	if err != nil || !isDirectory(directory) {
		return ProjectDetection{}, fmt.Errorf("项目目录不存在：%s", directory)
	}
	result := ProjectDetection{
		Directory: directory, Name: filepath.Base(directory),
		ProjectType: detectProjectType(directory, ""), CleanCommand: defaultCleanCommand,
		Scripts: []ProjectScript{}, Sources: []string{}, Warnings: []string{},
	}
	manifestURL, manifestFound, manifestWarning := detectManifestURL(directory)
	if gameResult, ok := detectStandaloneGameProject(directory); ok {
		gameResult.ReleaseCommand = detectedReleaseCommand(directory)
		if manifestURL != "" {
			gameResult.URL = manifestURL
		}
		appendManifestNotice(&gameResult, manifestFound, manifestWarning)
		m.mu.RLock()
		gameResult.Workspace = m.suggestedWorkspaceLocked(directory)
		m.mu.RUnlock()
		return gameResult, nil
	}
	info := readPackageInfo(directory)
	if info != nil {
		result.Sources = append(result.Sources, "package.json")
		if info.Name != "" {
			result.Name = info.Name
		}
		manager := detectPackageManager(directory, info.PackageManager)
		for _, script := range info.Scripts {
			scriptURL := detectProjectURL(directory, script.Command, info.Scripts, &result.Sources)
			if manifestURL != "" {
				scriptURL = manifestURL
			}
			result.Scripts = append(result.Scripts, ProjectScript{
				Name: script.Name, Preview: script.Command,
				Command: packageScriptCommand(manager, script.Name),
				URL:     scriptURL,
			})
		}
		if script := preferredProjectScript(result.Scripts); script != nil {
			result.Command, result.URL = script.Command, script.URL
		}
		for _, script := range result.Scripts {
			if script.Name == "clean" {
				result.CleanCommand = script.Command
			}
		}
	} else if isFile(filepath.Join(directory, "package.json")) {
		result.Warnings = append(result.Warnings, "package.json 无法解析，请手动填写启动命令。")
	}
	if manifestURL != "" {
		result.URL = manifestURL
	}
	appendManifestNotice(&result, manifestFound, manifestWarning)
	if result.ProjectType == "vite" && result.CleanCommand == defaultCleanCommand {
		result.CleanCommand = "rm -rf node_modules/.vite"
	}
	if result.Command == "" {
		result.Warnings = append(result.Warnings, "未识别到常用启动脚本，请选择脚本或手动填写启动命令。")
	}
	if result.URL == "" {
		result.Warnings = append(result.Warnings, "未确定访问地址，可按项目实际端口填写，也可以留空。")
	}
	m.mu.RLock()
	result.Workspace = m.suggestedWorkspaceLocked(directory)
	m.mu.RUnlock()
	return result, nil
}

func preferredProjectScript(scripts []ProjectScript) *ProjectScript {
	for _, name := range []string{"dev", "start", "serve", "develop", "start:dev", "dev:server"} {
		for index := range scripts {
			if scripts[index].Name == name {
				return &scripts[index]
			}
		}
	}
	return nil
}

func detectPackageManager(directory, declared string) string {
	for _, manager := range []string{"npm", "pnpm", "yarn", "bun"} {
		if declared == manager || strings.HasPrefix(declared, manager+"@") {
			return manager
		}
	}
	for _, lock := range []struct{ file, manager string }{
		{"pnpm-lock.yaml", "pnpm"}, {"yarn.lock", "yarn"},
		{"bun.lock", "bun"}, {"bun.lockb", "bun"},
	} {
		if isFile(filepath.Join(directory, lock.file)) {
			return lock.manager
		}
	}
	return "npm"
}

func packageScriptCommand(manager, name string) string {
	if !simpleScriptName.MatchString(name) {
		name = shellQuote(name)
	}
	return manager + " run " + name
}

func addDetectionSource(sources *[]string, filename string) {
	for _, source := range *sources {
		if source == filename {
			return
		}
	}
	*sources = append(*sources, filename)
}
