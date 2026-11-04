package launcher

import "context"

// Desktop isolates native operations from the process manager and its tests.
type Desktop interface {
	Emit(string, any)
	ChooseDirectory(string) (string, error)
	ChoosePrompt(string) (string, error)
	SaveLogFile(string) (string, error)
	CopyText(string) error
	OpenURL(string) error
}

// Lifecycle functions are not exposed as frontend bridge methods.
func Startup(app *App, ctx context.Context, desktop Desktop) {
	app.ctx = ctx
	app.desktop = desktop
	app.serviceManager.emit = desktop.Emit
}

func HasRunningProcesses(app *App) bool {
	app.mu.RLock()
	defer app.mu.RUnlock()
	return len(app.processes)+len(app.scriptProcesses) > 0
}
func Shutdown(app *App) { app.stopAllProcesses() }
