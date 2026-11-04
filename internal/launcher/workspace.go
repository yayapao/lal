package launcher

import (
	"fmt"
	"sort"
	"strings"
)

type WorkspaceLayout struct {
	Workspaces  []string          `json:"workspaces"`
	Assignments map[string]string `json:"assignments"`
}

func (m *serviceManager) workspaceNamesLocked() []string {
	names := make([]string, 0, len(m.workspaces))
	seen := make(map[string]bool)
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name != "" && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	for _, name := range m.workspaces {
		add(name)
	}
	for _, service := range m.services {
		add(service.Workspace)
	}
	sort.SliceStable(names, func(i, j int) bool { return strings.ToLower(names[i]) < strings.ToLower(names[j]) })
	return names
}

// Saves workspace names and all memberships in a single atomic config write.
// It also works while services are running because no launch settings change.
func (m *serviceManager) SaveWorkspaceLayout(input WorkspaceLayout) error {
	workspaces := make([]string, 0, len(input.Workspaces))
	known := make(map[string]bool)
	for _, name := range input.Workspaces {
		name = strings.TrimSpace(name)
		if name == "" || name == "未分组" || len([]rune(name)) > 80 {
			return fmt.Errorf("Workspace 名称需为 1–80 个字符，且不能使用“未分组”")
		}
		if known[name] {
			return fmt.Errorf("Workspace %q 已存在", name)
		}
		known[name] = true
		workspaces = append(workspaces, name)
	}
	m.mu.Lock()
	if len(input.Assignments) != len(m.services) {
		m.mu.Unlock()
		return fmt.Errorf("项目列表已变化，请重新打开 Workspace 管理")
	}
	updated := append([]Service(nil), m.services...)
	for index := range updated {
		workspace, exists := input.Assignments[updated[index].ID]
		if !exists {
			m.mu.Unlock()
			return fmt.Errorf("项目列表已变化，请重新打开 Workspace 管理")
		}
		workspace = strings.TrimSpace(workspace)
		if workspace != "" && !known[workspace] {
			m.mu.Unlock()
			return fmt.Errorf("项目 %s 的 Workspace 不存在", updated[index].Name)
		}
		updated[index].Workspace = workspace
	}
	previousServices, previousWorkspaces := m.services, m.workspaces
	m.services, m.workspaces = updated, workspaces
	if err := m.saveConfigLocked(); err != nil {
		m.services, m.workspaces = previousServices, previousWorkspaces
		m.mu.Unlock()
		return err
	}
	m.mu.Unlock()
	m.emitEvent("services:changed", nil)
	return nil
}
