package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (m *serviceManager) serviceByID(id string) (Service, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	service, ok := m.serviceByIDLocked(id)
	if !ok {
		return Service{}, fmt.Errorf("服务不存在")
	}
	service.PromptFiles = append([]string(nil), service.PromptFiles...)
	return service, nil
}

func (m *serviceManager) serviceByIDLocked(id string) (Service, bool) {
	for _, service := range m.services {
		if service.ID == id {
			return service, true
		}
	}
	return Service{}, false
}

func (m *serviceManager) serviceIndexLocked(id string) int {
	for index, service := range m.services {
		if service.ID == id {
			return index
		}
	}
	return -1
}

func (m *serviceManager) nameExistsLocked(name, exceptID string) bool {
	for _, service := range m.services {
		if service.ID != exceptID && strings.EqualFold(service.Name, name) {
			return true
		}
	}
	return false
}

func (m *serviceManager) serviceViewsLocked() []ServiceView {
	views := make([]ServiceView, 0, len(m.services))
	for _, service := range m.services {
		views = append(views, m.serviceViewLocked(service))
	}
	sort.SliceStable(views, func(i, j int) bool {
		return strings.ToLower(views[i].Name) < strings.ToLower(views[j].Name)
	})
	return views
}

func (m *serviceManager) serviceViewLocked(service Service) ServiceView {
	service.PromptFiles = append([]string(nil), service.PromptFiles...)
	configuredWorkspace := strings.TrimSpace(service.Workspace)
	service.Workspace = m.effectiveWorkspaceLocked(service)
	view := ServiceView{
		Service:             service,
		PackageInfo:         readPackageInfo(service.Directory),
		IconPath:            detectServiceIcon(service.Directory),
		ConfiguredWorkspace: configuredWorkspace,
		ProjectType:         detectProjectType(service.Directory, service.Command),
		Status:              m.lastStatus[service.ID],
		LastError:           m.lastError[service.ID],
		PathExists:          isDirectory(service.Directory),
		Health:              "stopped",
	}
	if info, err := os.Stat(view.IconPath); err == nil && info.Mode().IsRegular() {
		view.IconVersion = fmt.Sprintf("%d:%d", info.ModTime().UnixNano(), info.Size())
	}
	if service.URL == "" {
		view.Health = "not_configured"
	}
	if view.Status == "" {
		view.Status = "stopped"
	}
	if process, ok := m.processes[service.ID]; ok {
		view.PID = process.cmd.Process.Pid
		view.StartedAt = process.startedAt.Format(time.RFC3339)
		view.Health = m.health[service.ID]
		view.HealthInfo = m.healthInfo[service.ID]
		if view.Health == "" {
			view.Health = "checking"
		}
	}
	if _, running := m.scriptProcesses[service.ID]; running {
		view.ActiveScript = m.activeScript[service.ID]
		view.ScriptStatus = "running"
		view.ScriptStatusInfo = m.scriptStatusInfo[service.ID]
	} else {
		view.ScriptStatus = m.scriptStatus[service.ID]
		view.ScriptStatusInfo = m.scriptStatusInfo[service.ID]
	}
	return view
}

// SetServiceWorkspace updates only membership. Empty means unassigned.
func (m *serviceManager) SetServiceWorkspace(id, workspace string) (ServiceView, error) {
	workspace = strings.TrimSpace(workspace)
	if len([]rune(workspace)) > 80 {
		return ServiceView{}, fmt.Errorf("Workspace 不能超过 80 个字符")
	}

	m.mu.Lock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("服务不存在")
	}
	previous := m.services[index]
	updated := previous
	updated.Workspace = workspace
	if err := validateService(updated); err != nil {
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

// GetServiceIcon returns a data URL for the configured project logo. This is
// used instead of a custom asset route because Wails development mode serves
// the frontend from Vite, which does not proxy the application asset handler.
func (m *serviceManager) GetServiceIcon(id string) (string, error) {
	service, err := m.serviceByID(id)
	if err != nil {
		return "", err
	}
	iconPath := detectServiceIcon(service.Directory)
	if iconPath == "" {
		return "", fmt.Errorf("未找到项目图标")
	}
	info, err := os.Stat(iconPath)
	if err != nil || !info.Mode().IsRegular() {
		return "", fmt.Errorf("读取项目图标失败")
	}
	if info.Size() > maxIconFileBytes {
		return "", fmt.Errorf("项目图标不能超过 2 MB")
	}
	data, err := os.ReadFile(iconPath)
	if err != nil {
		return "", fmt.Errorf("读取项目图标失败：%w", err)
	}
	mimeType := ""
	switch strings.ToLower(filepath.Ext(iconPath)) {
	case ".png":
		mimeType = "image/png"
	case ".jpg", ".jpeg":
		mimeType = "image/jpeg"
	case ".webp":
		mimeType = "image/webp"
	case ".svg":
		mimeType = "image/svg+xml"
	case ".gif":
		mimeType = "image/gif"
	case ".avif":
		mimeType = "image/avif"
	case ".ico":
		mimeType = "image/x-icon"
	default:
		return "", fmt.Errorf("不支持的项目图标格式")
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func (m *serviceManager) effectiveWorkspaceLocked(service Service) string {
	return strings.TrimSpace(service.Workspace)
}

func (m *serviceManager) suggestedWorkspaceLocked(directory string) string {
	var parent *Service
	for index := range m.services {
		candidate := &m.services[index]
		if candidate.Workspace != "" && pathWithin(candidate.Directory, directory) &&
			(parent == nil || len(candidate.Directory) > len(parent.Directory)) {
			parent = candidate
		}
	}
	if parent != nil {
		return parent.Workspace
	}
	return ""
}

// Used once when migrating directory-based groups to explicit membership.
func (m *serviceManager) legacyWorkspaceLocked(service Service) string {
	if workspace := strings.TrimSpace(service.Workspace); workspace != "" {
		return workspace
	}
	serviceDirectory := cleanDirectory(service.Directory)

	// A configured project that contains other configured projects acts as the
	// implicit workspace root. This keeps ViewAI and nested ViewAI tools in one
	// workspace without requiring users to duplicate the label.
	for _, other := range m.services {
		if other.ID == service.ID || cleanDirectory(other.Directory) == serviceDirectory {
			continue
		}
		if pathWithin(serviceDirectory, other.Directory) {
			return service.Name
		}
	}

	var parent *Service
	for index := range m.services {
		candidate := &m.services[index]
		if candidate.ID == service.ID || cleanDirectory(candidate.Directory) == serviceDirectory {
			continue
		}
		if !pathWithin(candidate.Directory, serviceDirectory) {
			continue
		}
		if parent == nil || len(candidate.Directory) > len(parent.Directory) {
			parent = candidate
		}
	}
	if parent == nil {
		return ""
	}
	if workspace := strings.TrimSpace(parent.Workspace); workspace != "" {
		return workspace
	}
	return parent.Name
}
