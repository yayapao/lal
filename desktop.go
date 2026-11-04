package main

import (
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type nativeDesktop struct{ app *application.App }

func (d nativeDesktop) Emit(name string, payload any) { d.app.Event.Emit(name, payload) }
func (d nativeDesktop) ChooseDirectory(current string) (string, error) {
	return d.app.Dialog.OpenFile().SetTitle("选择项目目录").SetDirectory(current).
		CanChooseFiles(false).CanChooseDirectories(true).PromptForSingleSelection()
}
func (d nativeDesktop) ChoosePrompt(directory string) (string, error) {
	return d.app.Dialog.OpenFile().SetTitle("添加 Prompt 文件").SetDirectory(directory).
		AddFilter("文本文件", "*.md;*.markdown;*.txt;*.prompt").PromptForSingleSelection()
}
func (d nativeDesktop) SaveLogFile(filename string) (string, error) {
	return d.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{Title: "下载服务日志"}).SetFilename(filename).
		CanCreateDirectories(true).AddFilter("日志文件 (*.log)", "*.log").PromptForSingleSelection()
}
func (d nativeDesktop) CopyText(value string) error {
	if !d.app.Clipboard.SetText(value) {
		return fmt.Errorf("无法写入系统剪贴板")
	}
	return nil
}
func (d nativeDesktop) OpenURL(url string) error { return d.app.Browser.OpenURL(url) }
