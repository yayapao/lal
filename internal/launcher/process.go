package launcher

import (
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

func (m *serviceManager) StartService(id string) error {
	return m.startManagedService(id, false)
}

func (m *serviceManager) StopService(id string) error {
	m.mu.Lock()
	process, running := m.processes[id]
	if !running {
		m.mu.Unlock()
		return nil
	}
	process.stopping = true
	m.lastStatus[id] = "stopping"
	m.mu.Unlock()
	m.emitState(id)
	if process.phase == "building" {
		m.appendLog(id, "system", "正在取消构建…")
	} else {
		m.appendLog(id, "system", "正在停止服务…")
	}

	pid := process.cmd.Process.Pid
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		m.restoreRunningState(id, process, err)
		return fmt.Errorf("发送停止信号失败：%w", err)
	}

	timer := time.NewTimer(m.stopTimeout)
	defer timer.Stop()
	ticker := time.NewTicker(40 * time.Millisecond)
	defer ticker.Stop()
	done := process.done
	for processGroupExists(pid) {
		select {
		case <-done:
			done = nil
		case <-ticker.C:
		case <-timer.C:
			if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
				return fmt.Errorf("强制停止失败：%w", err)
			}
			if done != nil {
				<-done
			}
			m.finalizeStoppedProcess(id, process)
			return nil
		}
	}
	if done != nil {
		<-done
	}
	m.finalizeStoppedProcess(id, process)
	return nil
}

// RestartService stops the process managed by LAL and starts it again. A
// stopped service is started directly; services in a transition state must
// finish that transition before another lifecycle operation is allowed.
func (m *serviceManager) RestartService(id string) error {
	m.mu.RLock()
	service, ok := m.serviceByIDLocked(id)
	status := m.lastStatus[id]
	_, running := m.processes[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("服务不存在")
	}
	if status == "building" || status == "starting" || status == "stopping" {
		return fmt.Errorf("服务正在%s，请稍后再试", map[string]string{"building": "构建", "starting": "启动", "stopping": "停止"}[status])
	}
	if !isDirectory(service.Directory) {
		return fmt.Errorf("项目目录不存在：%s", service.Directory)
	}
	if running {
		if err := m.StopService(id); err != nil {
			return err
		}
	}
	return m.StartService(id)
}

// ClearNextCache runs the configured cache-cleanup command in the project
// directory. A running service is restarted after cleanup so that Next.js
// rebuilds from the fresh cache state.
func (m *serviceManager) ClearNextCache(id string) error {
	service, err := m.serviceByID(id)
	if err != nil {
		return err
	}
	if !isDirectory(service.Directory) {
		return fmt.Errorf("项目目录不存在：%s", service.Directory)
	}

	m.mu.RLock()
	status := m.lastStatus[id]
	_, running := m.processes[id]
	m.mu.RUnlock()
	if status == "building" || status == "starting" || status == "stopping" {
		return fmt.Errorf("服务正在%s，请稍后再试", map[string]string{"building": "构建", "starting": "启动", "stopping": "停止"}[status])
	}
	service.CleanCommand = normalizeCleanCommand(service.CleanCommand)
	if running {
		if err := m.StopService(id); err != nil {
			return err
		}
	}

	output, err := m.runCleanupCommand(service)
	if err != nil {
		if strings.TrimSpace(output) != "" {
			m.appendLog(id, "system", output)
		}
		return fmt.Errorf("执行缓存清理脚本失败：%w", err)
	}
	if strings.TrimSpace(output) != "" {
		m.appendLog(id, "system", output)
	}
	m.appendLog(id, "system", fmt.Sprintf("已执行缓存清理脚本：%s", service.CleanCommand))

	if running {
		if err := m.StartService(id); err != nil {
			return fmt.Errorf("缓存已清除，但服务重启失败：%w", err)
		}
	}
	return nil
}

func (m *serviceManager) runCleanupCommand(service Service) (string, error) {
	m.mu.RLock()
	shell := m.commandShell
	args := append([]string(nil), m.commandArgs...)
	m.mu.RUnlock()
	args = append(args, service.CleanCommand)
	cmd := exec.Command(shell, args...)
	cmd.Dir = service.Directory
	output, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(output)), err
}
