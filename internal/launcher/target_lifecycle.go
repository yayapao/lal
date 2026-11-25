package launcher

import (
	"errors"
	"fmt"
)

func selectTargets(service Service, ids []string, defaults bool) ([]string, error) {
	selected := map[string]bool{}
	for _, id := range ids {
		selected[id] = true
	}
	result := []string{}
	for _, target := range service.LaunchTargets {
		if (defaults && target.Default) || (!defaults && selected[target.ID]) {
			result = append(result, targetService(service, target).ID)
		}
		delete(selected, target.ID)
	}
	if !defaults && len(selected) > 0 {
		return nil, fmt.Errorf("选择中包含不存在的进程")
	}
	return result, nil
}

// A project operation serializes child starts/stops, configuration edits and
// cleanup. Individual child failures do not stop healthy siblings.
func (m *serviceManager) withProjectOperation(id string, action func(Service) error) error {
	m.mu.Lock()
	service, ok := m.serviceByIDLocked(id)
	root := parentID(id)
	index := m.serviceIndexLocked(root)
	if ok && index >= 0 && len(m.services[index].LaunchTargets) == 0 {
		m.mu.Unlock()
		return action(service)
	}
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("服务不存在")
	}
	if m.targetBusy[root] {
		m.mu.Unlock()
		return fmt.Errorf("项目正在执行启动或停止操作，请稍后再试")
	}
	m.targetBusy[root] = true
	m.mu.Unlock()
	defer func() { m.mu.Lock(); delete(m.targetBusy, root); m.mu.Unlock(); m.emitState(root) }()
	return action(service)
}

func (m *serviceManager) StartService(id string) error {
	return m.withProjectOperation(id, func(service Service) error {
		if len(service.LaunchTargets) == 0 {
			return m.startManagedService(id, false)
		}
		ids, _ := selectTargets(service, nil, true)
		if len(ids) == 0 {
			return fmt.Errorf("请先选择默认启动进程，或使用“启动所选”")
		}
		return m.startTargetIDs(ids)
	})
}

// StartLaunchTargets starts an explicit selection without changing defaults or
// stopping already-running targets. Commands always come from saved config.
func (m *serviceManager) StartLaunchTargets(id string, targetIDs []string) error {
	return m.withProjectOperation(id, func(service Service) error {
		if len(service.LaunchTargets) == 0 {
			return fmt.Errorf("该项目未配置多个进程")
		}
		ids, err := selectTargets(service, targetIDs, false)
		if err != nil {
			return err
		}
		if len(ids) == 0 {
			return fmt.Errorf("请至少选择一个进程")
		}
		return m.startTargetIDs(ids)
	})
}

func (m *serviceManager) startTargetIDs(ids []string) error {
	var failures []error
	for _, id := range ids {
		if err := m.startManagedService(id, false); err != nil {
			service, _ := m.serviceByID(id)
			failures = append(failures, fmt.Errorf("%s：%w", service.Name, err))
		}
	}
	return errors.Join(failures...)
}

func (m *serviceManager) stopTargetIDs(ids []string) error {
	var failures []error
	for _, id := range ids {
		if err := m.stopManagedProcess(id); err != nil {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

func (m *serviceManager) StopService(id string) error {
	return m.withProjectOperation(id, func(service Service) error { return m.stopTargetIDs(runtimeIDs(service)) })
}

func (m *serviceManager) activeTargetIDs(service Service) []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := []string{}
	for _, id := range runtimeIDs(service) {
		if m.processes[id] != nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (m *serviceManager) RestartService(id string) error {
	return m.withProjectOperation(id, func(service Service) error {
		if len(service.LaunchTargets) == 0 {
			return m.restartSingleService(id)
		}
		ids := m.activeTargetIDs(service)
		if len(ids) == 0 {
			ids, _ = selectTargets(service, nil, true)
		}
		if len(ids) == 0 {
			return fmt.Errorf("未选择默认启动进程")
		}
		if err := m.stopTargetIDs(ids); err != nil {
			return err
		}
		return m.startTargetIDs(ids)
	})
}

func (m *serviceManager) ClearNextCache(id string) error {
	id = parentID(id)
	return m.withProjectOperation(id, func(service Service) error {
		if len(service.LaunchTargets) == 0 {
			return m.clearSingleCache(id)
		}
		if !isDirectory(service.Directory) {
			return fmt.Errorf("项目目录不存在：%s", service.Directory)
		}
		m.mu.RLock()
		scriptBusy := m.scriptProcesses[id] != nil || m.scriptStatus[id] == "running"
		m.mu.RUnlock()
		if scriptBusy {
			return fmt.Errorf("请先停止正在执行的 npm 脚本")
		}
		ids := m.activeTargetIDs(service)
		if err := m.stopTargetIDs(ids); err != nil {
			return err
		}
		output, err := m.runCleanupCommand(service)
		if output != "" {
			m.appendLog(id, "system", output)
		}
		if err != nil {
			return fmt.Errorf("执行缓存清理脚本失败：%w", err)
		}
		m.appendLog(id, "system", "已执行缓存清理脚本："+service.CleanCommand)
		return m.startTargetIDs(ids)
	})
}

func (m *serviceManager) defaultTargetsRunning(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	service, ok := m.serviceByIDLocked(id)
	if !ok {
		return false
	}
	if len(service.LaunchTargets) == 0 {
		return m.processes[id] != nil || m.lastStatus[id] == "starting"
	}
	ids, _ := selectTargets(service, nil, true)
	if len(ids) == 0 {
		return false
	}
	for _, key := range ids {
		if m.processes[key] == nil {
			return false
		}
	}
	return true
}
