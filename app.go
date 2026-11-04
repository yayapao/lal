package main

import (
	"context"
	"lal/internal/launcher"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App is the desktop service. Process and project logic lives in launcher.
type App struct {
	*launcher.App
	desktop launcher.Desktop
}

func NewApp() *App { return &App{App: launcher.NewApp()} }

func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	launcher.Startup(a.App, ctx, a.desktop)
	return nil
}

func (a *App) ServiceShutdown() error {
	launcher.Shutdown(a.App)
	return nil
}
