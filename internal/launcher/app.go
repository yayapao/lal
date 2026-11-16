package launcher

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// App connects the service manager to the Wails runtime.
type App struct {
	ctx     context.Context
	desktop Desktop
	*serviceManager
}

func NewApp() *App {
	return &App{serviceManager: newServiceManager(defaultConfigPath())}
}

func newAppWithConfigPath(path string) *App {
	return &App{serviceManager: newServiceManager(path)}
}

func (a *App) ChooseDirectory(current string) (string, error) {
	return a.desktop.ChooseDirectory(current)
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
	path, err := a.desktop.SaveLogFile(fmt.Sprintf("%s-%s.log", filename, time.Now().Format("20060102-150405")))
	if err != nil || path == "" {
		return path, err
	}
	if err := writePrivateLog(filepath.Clean(path), formatLogEntries(entries)); err != nil {
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
		for _, line := range strings.Split(redactLog(entry.Text), "\n") {
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
	return a.desktop.OpenURL(service.URL)
}

func commandError(output []byte, err error) string {
	message := strings.TrimSpace(string(output))
	if message != "" {
		return message
	}
	return err.Error()
}
