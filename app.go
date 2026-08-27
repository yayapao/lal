package main

import (
	"context"
	"fmt"
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
