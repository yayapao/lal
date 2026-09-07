package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App connects the service manager to the Wails runtime.
type App struct {
	ctx context.Context
	*serviceManager
}

func NewApp() *App {
	return &App{serviceManager: newServiceManager(defaultConfigPath())}
}

func newAppWithConfigPath(path string) *App {
	return &App{serviceManager: newServiceManager(path)}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.serviceManager.emit = func(name string, payload any) {
		runtime.EventsEmit(ctx, name, payload)
	}
}

func (a *App) shutdown(context.Context) {
	a.stopAllProcesses()
}

func (a *App) beforeClose(ctx context.Context) bool {
	if a.runningCount() == 0 {
		return false
	}

	choice, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "仍有服务在运行",
		Message:       "退出 LAL 会同时停止本次会话启动的所有服务。",
		Buttons:       []string{"取消", "停止并退出"},
		DefaultButton: "停止并退出",
		CancelButton:  "取消",
	})
	if err != nil || choice != "停止并退出" {
		return true
	}

	a.stopAllProcesses()
	return false
}

func (a *App) ChooseDirectory(current string) (string, error) {
	options := runtime.OpenDialogOptions{Title: "选择项目目录"}
	if strings.TrimSpace(current) != "" {
		options.DefaultDirectory = current
	}
	return runtime.OpenDirectoryDialog(a.ctx, options)
}

func (a *App) DownloadLogs(id string) (string, error) {
	service, err := a.serviceByID(id)
	if err != nil {
		return "", err
	}
	entries := a.GetLogs(id)
	if len(entries) == 0 {
		return "", fmt.Errorf("当前没有可下载的日志")
	}
	filename := strings.NewReplacer("/", "-", "\\", "-", ":", "-").Replace(service.Name)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:                "下载服务日志",
		DefaultFilename:      fmt.Sprintf("%s-%s.log", filename, time.Now().Format("20060102-150405")),
		CanCreateDirectories: true,
		Filters: []runtime.FileFilter{{
			DisplayName: "日志文件 (*.log)",
			Pattern:     "*.log",
		}},
	})
	if err != nil || path == "" {
		return path, err
	}
	if err := os.WriteFile(filepath.Clean(path), []byte(formatLogEntries(entries)), 0o600); err != nil {
		return "", fmt.Errorf("保存日志失败：%w", err)
	}
	return path, nil
}

func formatLogEntries(entries []LogEntry) string {
	var output strings.Builder
	for _, entry := range entries {
		timestamp := entry.Timestamp
		if parsed, err := time.Parse(time.RFC3339Nano, entry.Timestamp); err == nil {
			timestamp = parsed.Local().Format("2006-01-02 15:04:05.000")
		}
		for _, line := range strings.Split(entry.Text, "\n") {
			fmt.Fprintf(&output, "%s [%s] %s\n", timestamp, strings.ToUpper(entry.Stream), line)
		}
	}
	return output.String()
}

func (a *App) RevealService(id string) error {
	service, err := a.serviceByID(id)
	if err != nil {
		return err
	}
	return exec.Command("open", filepath.Clean(service.Directory)).Start()
}

func (a *App) OpenServiceURL(id string) error {
	service, err := a.serviceByID(id)
	if err != nil {
		return err
	}
	if service.URL == "" {
		return fmt.Errorf("该服务尚未配置访问地址")
	}
	runtime.BrowserOpenURL(a.ctx, service.URL)
	return nil
}

func (a *App) ChooseAndAddPrompt(id string) (bool, error) {
	service, err := a.serviceByID(id)
	if err != nil {
		return false, err
	}
	defaultDirectory := filepath.Join(service.Directory, defaultPromptsDir)
	if !isDirectory(defaultDirectory) {
		defaultDirectory = service.Directory
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "添加 Prompt 文件",
		DefaultDirectory: defaultDirectory,
		Filters:          []runtime.FileFilter{{DisplayName: "文本文件", Pattern: "*.md;*.markdown;*.txt;*.prompt"}},
	})
	if err != nil || path == "" {
		return false, err
	}
	if err := a.AddPromptFile(id, path); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) CopyCodexPrompt(id, path string) error {
	prompt, err := a.readCodexPrompt(id, path)
	if err != nil {
		return err
	}
	if err := runtime.ClipboardSetText(a.ctx, prompt); err != nil {
		return fmt.Errorf("复制 Codex 启动提示词失败：%w", err)
	}
	return nil
}

func (a *App) OpenCodexWithPrompt(id, path string) error {
	service, err := a.serviceByID(id)
	if err != nil {
		return err
	}
	if !isDirectory(service.Directory) {
		return fmt.Errorf("项目目录不存在：%s", service.Directory)
	}
	if err := a.CopyCodexPrompt(id, path); err != nil {
		return err
	}

	codexURL := codexWorkspaceURL(service.Directory)
	if output, err := exec.Command("/usr/bin/open", codexURL).CombinedOutput(); err != nil {
		return fmt.Errorf("打开 Codex 失败：%s", commandError(output, err))
	}

	const pasteScript = `
tell application id "com.openai.codex" to activate
tell application "System Events"
	repeat 80 times
		if exists (first application process whose bundle identifier is "com.openai.codex") then
			tell first application process whose bundle identifier is "com.openai.codex"
				if frontmost and (count of windows) > 0 then exit repeat
			end tell
		end if
		delay 0.1
	end repeat
	delay 0.7
	keystroke "v" using command down
end tell`
	if output, err := exec.Command("/usr/bin/osascript", "-e", pasteScript).CombinedOutput(); err != nil {
		return fmt.Errorf("Codex 已打开，提示词已复制；自动粘贴需要在“系统设置 > 隐私与安全性 > 辅助功能”中允许 LAL：%s", commandError(output, err))
	}
	return nil
}

func codexWorkspaceURL(directory string) string {
	query := url.Values{"cwd": []string{directory}}
	return (&url.URL{Scheme: "codex", Host: "threads", Path: "/new", RawQuery: query.Encode()}).String()
}

func commandError(output []byte, err error) string {
	message := strings.TrimSpace(string(output))
	if message != "" {
		return message
	}
	return err.Error()
}
