package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

// OpenServiceInVSCode opens the configured project directly in Visual Studio
// Code. Using LaunchServices keeps the action independent from the caller's
// interactive shell and reports missing installations back to the UI.
func (a *App) OpenServiceInVSCode(id string) error {
	service, err := a.serviceByID(id)
	if err != nil {
		return err
	}
	if !isDirectory(service.Directory) {
		return fmt.Errorf("项目目录不存在：%s", service.Directory)
	}
	output, err := exec.Command("/usr/bin/open", "-a", "Visual Studio Code", filepath.Clean(service.Directory)).CombinedOutput()
	if err != nil {
		return fmt.Errorf("无法在 VS Code 中打开：%s", commandError(output, err))
	}
	return nil
}
