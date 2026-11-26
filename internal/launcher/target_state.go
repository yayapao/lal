package launcher

import (
	"fmt"
	"strings"
)

func (m *serviceManager) applyTargetViewsLocked(view *ServiceView) {
	view.Status, view.Health, view.LastError = "stopped", "not_configured", ""
	active, failed := 0, 0
	var problems []string
	checking := false
	for _, target := range view.LaunchTargets {
		child := m.serviceViewLocked(targetService(view.Service, target))
		view.TargetViews = append(view.TargetViews, child)
		if m.processes[child.ID] != nil {
			active++
			if view.StartedAt == "" || child.StartedAt < view.StartedAt {
				view.StartedAt = child.StartedAt
			}
			view.Status = "running"
			checking = checking || child.Health == "checking"
			if child.Health == "unreachable" {
				problems = append(problems, child.Name+"："+child.HealthInfo)
			}
		}
		if child.Status == "failed" {
			failed++
			problems = append(problems, child.Name+"："+child.LastError)
		}
	}
	if active == 0 && failed > 0 {
		view.Status = "failed"
	}
	if active > 0 {
		view.Health = "ready"
		if checking {
			view.Health = "checking"
		}
		if len(problems) > 0 {
			view.Health = "unreachable"
		}
	}
	if len(problems) > 0 {
		view.LastError = fmt.Sprintf("%d 个进程不可用", len(problems))
		view.HealthInfo = strings.Join(problems, "\n")
	}
}

// SetDefaultLaunchTargets changes only the saved selection, including while running.
func (m *serviceManager) SetDefaultLaunchTargets(id string, ids []string) (ServiceView, error) {
	m.mu.Lock()
	index := m.serviceIndexLocked(id)
	if index < 0 || len(m.services[index].LaunchTargets) == 0 {
		m.mu.Unlock()
		return ServiceView{}, fmt.Errorf("多进程项目不存在")
	}
	previous := m.services[index]
	selected, err := selectTargets(previous, ids, false)
	if err != nil {
		m.mu.Unlock()
		return ServiceView{}, err
	}
	defaults := map[string]bool{}
	for _, key := range selected {
		defaults[key] = true
	}
	updated := previous
	updated.LaunchTargets = append([]LaunchTarget(nil), previous.LaunchTargets...)
	for i := range updated.LaunchTargets {
		updated.LaunchTargets[i].Default = defaults[updated.ID+"::"+updated.LaunchTargets[i].ID]
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

func (m *serviceManager) storeLogLocked(id string, entry LogEntry) {
	entries := append(m.logs[id], entry)
	if len(entries) > maxLogEntries {
		entries = append([]LogEntry(nil), entries[len(entries)-maxLogEntries:]...)
	}
	m.logs[id] = entries
}

func (m *serviceManager) clearTargetStateLocked(service Service) {
	for _, id := range runtimeIDs(service) {
		if id == service.ID {
			continue
		}
		delete(m.logs, id)
		delete(m.lastStatus, id)
		delete(m.lastError, id)
		delete(m.health, id)
		delete(m.healthInfo, id)
	}
}
