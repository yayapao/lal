package launcher

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func defaultConfigPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "LAL", "config.json")
	}
	return filepath.Join(dir, "LAL", "config.json")
}

func newServiceManager(configPath string) *serviceManager {
	m := &serviceManager{
		configPath:       configPath,
		processes:        make(map[string]*processState),
		lastStatus:       make(map[string]string),
		lastError:        make(map[string]string),
		health:           make(map[string]string),
		healthInfo:       make(map[string]string),
		scriptProcesses:  make(map[string]*processState),
		activeScript:     make(map[string]string),
		scriptStatus:     make(map[string]string),
		scriptStatusInfo: make(map[string]string),
		logs:             make(map[string][]LogEntry),
		stopTimeout:      stopTimeout,
		healthGrace:      healthGrace,
		healthEvery:      healthEvery,
		healthTimeout:    healthTimeout,
		commandShell:     "/bin/zsh",
		commandArgs:      []string{"-lc", shellCommandWrapper, "lal"},
	}
	if err := m.loadConfig(); err != nil {
		m.configWarn = err.Error()
	}
	return m
}

func (m *serviceManager) loadConfig() error {
	data, err := os.ReadFile(m.configPath)
	if errors.Is(err, os.ErrNotExist) {
		m.services = []Service{}
		return m.saveConfigLocked()
	}
	if err != nil {
		return fmt.Errorf("读取配置失败：%w", err)
	}

	var config configFile
	if err := json.Unmarshal(data, &config); err != nil {
		return fmt.Errorf("配置文件格式无效：%w", err)
	}
	if config.Version < 1 || config.Version > configVersion {
		return fmt.Errorf("不支持的配置版本：%d", config.Version)
	}
	migrating := config.Version < configVersion
	changed := migrating
	for index, service := range config.Services {
		original := service
		service.Module = normalizeModule(service.Module)
		service.Workspace = strings.TrimSpace(service.Workspace)
		service.URL = normalizeAccessURL(service.URL)
		if strings.TrimSpace(service.CleanCommand) == "" {
			service.CleanCommand = defaultCleanCommand
		}
		if legacyPrompt := strings.TrimSpace(service.PromptFile); legacyPrompt != "" && filepath.Clean(legacyPrompt) != filepath.Join(defaultPromptsDir, "codex-startup.md") {
			service.PromptFiles = append(service.PromptFiles, legacyPrompt)
		}
		service.PromptFile = ""
		service.PromptFiles = normalizePromptFiles(service.PromptFiles)
		if err := validateService(service); err != nil {
			return fmt.Errorf("服务 %q 的配置无效：%w", service.Name, err)
		}
		if !serviceEqual(service, original) {
			config.Services[index] = service
			changed = true
		}
	}
	m.services = append([]Service(nil), config.Services...)
	m.workspaces = append([]string(nil), config.Workspaces...)
	if config.Version < 5 {
		assignments := make([]string, len(m.services))
		for index, service := range m.services {
			assignments[index] = m.legacyWorkspaceLocked(service)
		}
		for index := range m.services {
			m.services[index].Workspace = assignments[index]
		}
	}
	m.workspaces = m.workspaceNamesLocked()
	if changed {
		return m.saveConfigLocked()
	}
	return nil
}

func (m *serviceManager) GetAppState() AppState {
	m.mu.RLock()
	state := AppState{
		Services:   m.serviceViewsLocked(),
		Workspaces: m.workspaceNamesLocked(),
		ConfigPath: m.configPath,
		Warning:    m.configWarn,
	}
	m.mu.RUnlock()
	for i := range state.Services {
		view := &state.Services[i]
		if view.URL != "" && (view.Status != "running" || isNativeGame(view.Service)) {
			view.Port = inspectExternalPort(view.Service)
		}
	}
	return state
}

func (m *serviceManager) CreateService(input ServiceInput) (ServiceView, error) {
	service := Service{
		ID:           newID(),
		Name:         strings.TrimSpace(input.Name),
		Module:       normalizeModule(input.Module),
		Workspace:    strings.TrimSpace(input.Workspace),
		Directory:    cleanDirectory(input.Directory),
		Command:      strings.TrimSpace(input.Command),
		URL:          normalizeAccessURL(input.URL),
		CleanCommand: normalizeCleanCommand(input.CleanCommand),
	}
	if err := validateService(service); err != nil {
		return ServiceView{}, err
	}

	m.mu.Lock()
	if m.nameExistsLocked(service.Name, "") {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("服务名称 %q 已存在", service.Name)
	}
	m.services = append(m.services, service)
	if err := m.saveConfigLocked(); err != nil {
		m.services = m.services[:len(m.services)-1]
		m.mu.Unlock()
		return ServiceView{}, err
	}
	view := m.serviceViewLocked(service)
	m.mu.Unlock()
	m.emitEvent("services:changed", view)
	return view, nil
}

func (m *serviceManager) UpdateService(id string, input ServiceInput) (ServiceView, error) {
	updated := Service{
		ID:           id,
		Name:         strings.TrimSpace(input.Name),
		Module:       normalizeModule(input.Module),
		Workspace:    strings.TrimSpace(input.Workspace),
		Directory:    cleanDirectory(input.Directory),
		Command:      strings.TrimSpace(input.Command),
		URL:          normalizeAccessURL(input.URL),
		CleanCommand: normalizeCleanCommand(input.CleanCommand),
	}
	if err := validateService(updated); err != nil {
		return ServiceView{}, err
	}

	m.mu.Lock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("服务不存在")
	}
	if _, running := m.processes[id]; running || m.lastStatus[id] == "starting" {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("请先停止服务再修改配置")
	}
	if _, running := m.scriptProcesses[id]; running {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("请先停止正在执行的 npm 脚本")
	}
	if m.nameExistsLocked(updated.Name, id) {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("服务名称 %q 已存在", updated.Name)
	}
	previous := m.services[index]
	updated.PromptFiles = append([]string(nil), previous.PromptFiles...)
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

func (m *serviceManager) DeleteService(id string) error {
	m.mu.Lock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		m.mu.Unlock()
		return fmt.Errorf("服务不存在")
	}
	if _, running := m.processes[id]; running || m.lastStatus[id] == "starting" {
		m.mu.Unlock()
		return fmt.Errorf("请先停止服务再删除")
	}
	if _, running := m.scriptProcesses[id]; running {
		m.mu.Unlock()
		return fmt.Errorf("请先停止正在执行的 npm 脚本再删除")
	}
	previous := append([]Service(nil), m.services...)
	m.services = append(m.services[:index], m.services[index+1:]...)
	if err := m.saveConfigLocked(); err != nil {
		m.services = previous
		m.mu.Unlock()
		return err
	}
	delete(m.logs, id)
	delete(m.scriptProcesses, id)
	delete(m.activeScript, id)
	delete(m.scriptStatus, id)
	delete(m.scriptStatusInfo, id)
	delete(m.lastStatus, id)
	delete(m.lastError, id)
	delete(m.health, id)
	delete(m.healthInfo, id)
	m.mu.Unlock()
	m.emitEvent("services:changed", map[string]string{"deletedId": id})
	return nil
}
