package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"time"
)

func (m *serviceManager) saveConfigLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.configPath), 0o755); err != nil {
		return fmt.Errorf("创建配置目录失败：%w", err)
	}
	temp, err := os.CreateTemp(filepath.Dir(m.configPath), "config-*.json")
	if err != nil {
		return fmt.Errorf("创建临时配置失败：%w", err)
	}
	tempName := temp.Name()
	defer os.Remove(tempName)

	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return fmt.Errorf("设置配置权限失败：%w", err)
	}
	encoder := json.NewEncoder(temp)
	encoder.SetIndent("", "  ")
	workspaces := m.workspaceNamesLocked()
	if err := encoder.Encode(configFile{Version: configVersion, Services: m.services, Workspaces: workspaces}); err != nil {
		temp.Close()
		return fmt.Errorf("写入配置失败：%w", err)
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return fmt.Errorf("同步配置失败：%w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("关闭配置失败：%w", err)
	}
	if err := os.Rename(tempName, m.configPath); err != nil {
		return fmt.Errorf("保存配置失败：%w", err)
	}
	m.workspaces = workspaces
	return nil
}

func (m *serviceManager) serviceIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := make([]string, 0, len(m.services))
	for _, service := range m.services {
		ids = append(ids, service.ID)
	}
	return ids
}

func (m *serviceManager) runningIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := make([]string, 0, len(m.processes))
	for _, service := range m.services {
		if _, ok := m.processes[service.ID]; ok {
			ids = append(ids, service.ID)
		}
	}
	return ids
}

func (m *serviceManager) isRunningOrStarting(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.processes[id]
	return ok || m.lastStatus[id] == "starting"
}

func (m *serviceManager) isStoppable(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, running := m.processes[id]
	return running && m.lastStatus[id] != "stopping"
}

func (m *serviceManager) runningCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.processes)
}

func (m *serviceManager) stopAllProcesses() {
	for _, id := range m.runningIDs() {
		_ = m.StopService(id)
	}
	for _, id := range m.runningScriptIDs() {
		_ = m.StopPackageScript(id)
	}
}

func (m *serviceManager) runningScriptIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := make([]string, 0, len(m.scriptProcesses))
	for _, service := range m.services {
		if _, ok := m.scriptProcesses[service.ID]; ok {
			ids = append(ids, service.ID)
		}
	}
	return ids
}

func validateService(service Service) error {
	if strings.TrimSpace(service.ID) == "" {
		return fmt.Errorf("服务 ID 不能为空")
	}
	if name := strings.TrimSpace(service.Name); name == "" {
		return fmt.Errorf("服务名称不能为空")
	} else if len([]rune(name)) > 80 {
		return fmt.Errorf("服务名称不能超过 80 个字符")
	}
	if len([]rune(strings.TrimSpace(service.Workspace))) > 80 {
		return fmt.Errorf("Workspace 不能超过 80 个字符")
	}
	if strings.TrimSpace(service.Directory) == "" {
		return fmt.Errorf("项目目录不能为空")
	}
	if command := strings.TrimSpace(service.Command); command == "" {
		return fmt.Errorf("启动命令不能为空")
	} else if len(command) > maxCommandLength {
		return fmt.Errorf("启动命令不能超过 %d 个字符", maxCommandLength)
	}
	if cleanCommand := strings.TrimSpace(service.CleanCommand); len(cleanCommand) > maxCleanCommandLength {
		return fmt.Errorf("缓存清理脚本不能超过 %d 个字符", maxCleanCommandLength)
	}
	for _, promptFile := range service.PromptFiles {
		if len(strings.TrimSpace(promptFile)) > maxPromptFileLength {
			return fmt.Errorf("Prompt 文件路径不能超过 %d 个字符", maxPromptFileLength)
		}
	}
	if service.URL != "" {
		parsed, err := url.Parse(service.URL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
			return fmt.Errorf("访问地址必须是有效的 http 或 https 地址")
		}
	}
	return nil
}

func uniqueIDs(ids []string) []string {
	unique := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	return unique
}

func serviceEqual(left, right Service) bool {
	return left.ID == right.ID && left.Name == right.Name && left.Workspace == right.Workspace && left.Directory == right.Directory && left.Command == right.Command &&
		left.URL == right.URL && left.CleanCommand == right.CleanCommand && left.PromptFile == right.PromptFile && slices.Equal(left.PromptFiles, right.PromptFiles)
}

func knownServiceURL(directory string) string {
	switch cleanDirectory(directory) {
	case "/Users/yango/github/stock/mystock":
		return "http://localhost:35790"
	case "/Users/yango/Documents/huyaprojects/ai/viewai":
		return "http://localhost:3900"
	default:
		return ""
	}
}

func processGroupExists(pid int) bool {
	err := syscall.Kill(-pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

func newID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("service-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

func exitMessage(err error) string {
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
			if status.Signaled() {
				return fmt.Sprintf("进程被信号 %s 终止", status.Signal())
			}
			return fmt.Sprintf("进程已退出，退出码 %d", status.ExitStatus())
		}
	}
	return fmt.Sprintf("进程异常退出：%v", err)
}
