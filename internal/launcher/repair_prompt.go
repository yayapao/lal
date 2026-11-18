package launcher

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

func validateRepairPrompt(prompt string) error {
	if strings.TrimSpace(prompt) == "" || len(prompt) > 1024*1024 {
		return fmt.Errorf("修复 Prompt 不能为空或超过 1 MB")
	}
	return nil
}

func (a *App) CopyRepairPrompt(prompt string) error {
	if err := validateRepairPrompt(prompt); err != nil {
		return err
	}
	return a.desktop.CopyText(redactLog(prompt))
}

func (a *App) DownloadRepairPrompt(id, prompt string) (string, error) {
	service, err := a.serviceByID(id)
	if err != nil {
		return "", err
	}
	if err := validateRepairPrompt(prompt); err != nil {
		return "", err
	}
	filename := strings.NewReplacer("/", "-", "\\", "-", ":", "-").Replace(service.Name)
	path, err := a.desktop.SavePromptFile(fmt.Sprintf("%s-修复-%s.md", filename, time.Now().Format("20060102-150405")))
	if err != nil || path == "" {
		return path, err
	}
	if err := writePrivateLog(filepath.Clean(path), redactLog(prompt)); err != nil {
		return "", fmt.Errorf("保存修复 Prompt 失败：%w", err)
	}
	return path, nil
}
