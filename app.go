package main

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"

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

func (a *App) RevealService(id string) error {
	service, err := a.serviceByID(id)
	if err != nil {
		return err
	}
	return exec.Command("open", filepath.Clean(service.Directory)).Start()
}
