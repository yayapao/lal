package main

import (
	"context"
	"lal/internal/launcher"
)

// App keeps the desktop bridge at window.go.main.App while the backend lives
// in an internal package. Its public methods are promoted from launcher.App.
type App struct{ *launcher.App }

func NewApp() *App { return &App{App: launcher.NewApp()} }

func (a *App) startup(ctx context.Context)          { launcher.Startup(a.App, ctx) }
func (a *App) beforeClose(ctx context.Context) bool { return launcher.BeforeClose(a.App, ctx) }
func (a *App) shutdown(ctx context.Context)         { launcher.Shutdown(a.App, ctx) }
