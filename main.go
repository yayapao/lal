package main

import (
	"embed"
	"lal/internal/launcher"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

//go:embed frontend/src/assets/images/lal-status-icon.png
var statusIcon []byte

func main() {
	service := NewApp()
	guard := &quitGuard{running: func() bool { return launcher.HasRunningProcesses(service.App) }}
	app := application.New(application.Options{
		Name: "LAL", Icon: appIcon, Description: "本地开发服务控制台",
		Services:   []application.Service{application.NewService(service)},
		Assets:     application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:        application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: false},
		ShouldQuit: guard.shouldQuit,
	})
	service.desktop = nativeDesktop{app}
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "LAL", Width: 1240, Height: 780, MinWidth: 980, MinHeight: 640,
		BackgroundColour: application.NewRGB(28, 28, 30),
		Mac: application.MacWindow{
			TitleBar:   application.MacTitleBarHiddenInset,
			Appearance: application.NSAppearanceNameDarkAqua,
		},
	})
	show := func() { window.Show(); window.Focus() }
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		event.Cancel()
		window.Hide()
	})
	app.Event.OnApplicationEvent(events.Mac.ApplicationShouldHandleReopen, func(*application.ApplicationEvent) { show() })
	guard.confirm = func(done func(bool)) {
		show()
		dialog := app.Dialog.Question().SetTitle("仍有服务在运行").
			SetMessage("退出 LAL 会同时停止本次会话启动的所有服务。").AttachToWindow(window)
		dialog.AddButton("取消").SetAsCancel().OnClick(func() { done(false) })
		dialog.AddButton("停止并退出").SetAsDefault().OnClick(func() { done(true) })
		dialog.Show()
	}
	guard.quit = app.Quit
	tray := app.SystemTray.New().SetTemplateIcon(statusIcon)
	tray.OnClick(show)
	menu := app.Menu.New()
	menu.Add("显示 LAL").OnClick(func(*application.Context) { show() })
	menu.AddSeparator()
	menu.Add("退出 LAL").OnClick(func(*application.Context) { app.Quit() })
	tray.SetMenu(menu)
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
