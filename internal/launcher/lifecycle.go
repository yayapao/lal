package launcher

import "context"

// Lifecycle functions are not exported as frontend bridge methods.
func Startup(app *App, ctx context.Context)          { app.startup(ctx) }
func BeforeClose(app *App, ctx context.Context) bool { return app.beforeClose(ctx) }
func Shutdown(app *App, ctx context.Context)         { app.shutdown(ctx) }
