package launcher

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

func detectedReleaseCommand(directory string) string {
	var manifest lalProjectManifest
	if json.Unmarshal([]byte(readDetectionText(filepath.Join(directory, lalManifestFilename))), &manifest) != nil {
		return ""
	}
	command := strings.TrimSpace(manifest.ReleaseCommand)
	if len(command) > maxCommandLength {
		return ""
	}
	return command
}

func validateGameLaunch(service Service) error {
	if service.Module != moduleGame {
		if service.ReleaseCommand != "" || service.LaunchMode != "" {
			return fmt.Errorf("只有游戏支持正式 / Debug 启动配置")
		}
		return nil
	}
	if service.LaunchMode != "" && service.LaunchMode != "debug" && service.LaunchMode != "release" {
		return fmt.Errorf("游戏启动模式必须是 release 或 debug")
	}
	if len(service.ReleaseCommand) > maxCommandLength {
		return fmt.Errorf("正式版启动命令不能超过 %d 个字符", maxCommandLength)
	}
	_, err := launchCommand(service)
	return err
}

func launchCommand(service Service) (string, error) {
	if service.Module == moduleGame && service.LaunchMode == "release" {
		if strings.TrimSpace(service.ReleaseCommand) == "" {
			return "", fmt.Errorf("请先在游戏配置中填写正式版启动命令，指向已导出的 Release 产物")
		}
		return service.ReleaseCommand, nil
	}
	return service.Command, nil
}

func launchModeLabel(service Service) string {
	if service.Module != moduleGame {
		return ""
	}
	if service.LaunchMode == "release" {
		return "正式版"
	}
	return " Debug"
}

// SetGameLaunchMode persists the next launch choice without changing a running game.
func (m *serviceManager) SetGameLaunchMode(id, mode string) (ServiceView, error) {
	m.mu.Lock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("游戏不存在")
	}
	previous := m.services[index]
	if previous.Module != moduleGame {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("只有游戏支持切换启动模式")
	}
	if _, running := m.processes[id]; running || m.lastStatus[id] == "starting" || m.lastStatus[id] == "stopping" {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("请先停止游戏再切换启动模式")
	}
	if mode != "release" && mode != "debug" {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("游戏启动模式必须是 release 或 debug")
	}
	updated := previous
	updated.LaunchMode = mode
	if err := validateGameLaunch(updated); err != nil {
		m.mu.Unlock()
		return ServiceView{}, err
	}
	m.services[index] = updated
	if err := m.saveConfigLocked(); err != nil {
		m.services[index] = previous
		m.mu.Unlock()
		return ServiceView{}, err
	}
	view := m.serviceViewLocked(updated)
	m.mu.Unlock()
	m.emitEvent("services:changed", view)
	return view, nil
}
