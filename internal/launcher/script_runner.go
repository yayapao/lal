package launcher

import (
	"errors"
	"fmt"
	"os/exec"
	"slices"
	"strings"
	"syscall"
	"time"
)

// RunPackageScript executes a script declared by the project package manifest.
// It is deliberately separate from the main service process so a development
// server can remain active while one-off checks are run.
func (m *serviceManager) RunPackageScript(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("npm 脚本名称不能为空")
	}
	if len(name) > maxScriptNameLength {
		return fmt.Errorf("npm 脚本名称不能超过 %d 个字符", maxScriptNameLength)
	}
	service, err := m.serviceByID(id)
	if err != nil {
		return err
	}
	if !isDirectory(service.Directory) {
		return fmt.Errorf("项目目录不存在：%s", service.Directory)
	}
	manifest := readPackageInfo(service.Directory)
	if manifest == nil {
		return fmt.Errorf("未找到有效的 package.json")
	}
	scriptIndex := slices.IndexFunc(manifest.Scripts, func(item PackageScript) bool { return item.Name == name })
	if scriptIndex < 0 {
		return fmt.Errorf("package.json 中没有脚本 %q", name)
	}

	m.mu.Lock()
	if _, running := m.scriptProcesses[id]; running {
		current := m.activeScript[id]
		m.mu.Unlock()
		return fmt.Errorf("npm 脚本 %s 正在执行，请先停止", current)
	}
	m.activeScript[id] = name
	m.scriptStatus[id] = "running"
	m.scriptStatusInfo[id] = ""
	m.mu.Unlock()
	m.ClearLogs(id)

	args := append(append([]string(nil), m.commandArgs...), fmt.Sprintf("npm run --silent %s", shellQuote(name)))
	cmd := exec.Command(m.commandShell, args...)
	cmd.Dir = service.Directory
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.failPackageScript(id, name, err)
		return fmt.Errorf("启动脚本失败：%w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.failPackageScript(id, name, err)
		return fmt.Errorf("启动脚本失败：%w", err)
	}
	if err := cmd.Start(); err != nil {
		m.failPackageScript(id, name, err)
		return fmt.Errorf("启动脚本失败：%w", err)
	}

	process := &processState{cmd: cmd, startedAt: time.Now(), done: make(chan struct{})}
	m.mu.Lock()
	m.scriptProcesses[id] = process
	m.mu.Unlock()
	m.appendLog(id, "system", fmt.Sprintf("已启动 npm 脚本：%s", name))
	m.emitState(id)
	go m.captureOutput(id, "stdout", stdout)
	go m.captureOutput(id, "stderr", stderr)
	go m.waitForPackageScript(id, process, name)
	return nil
}

func (m *serviceManager) StopPackageScript(id string) error {
	m.mu.Lock()
	process, running := m.scriptProcesses[id]
	if !running {
		m.mu.Unlock()
		return nil
	}
	name := m.activeScript[id]
	process.stopping = true
	m.scriptStatus[id] = "stopping"
	m.scriptStatusInfo[id] = ""
	m.mu.Unlock()
	m.emitState(id)
	m.appendLog(id, "system", fmt.Sprintf("正在停止 npm 脚本：%s", name))

	pid := process.cmd.Process.Pid
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
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
				return fmt.Errorf("强制停止脚本失败：%w", err)
			}
			if done != nil {
				<-done
			}
			return nil
		}
	}
	if done != nil {
		<-done
	}
	return nil
}

func (m *serviceManager) failPackageScript(id, name string, err error) {
	m.mu.Lock()
	delete(m.scriptProcesses, id)
	if m.activeScript[id] == name {
		delete(m.activeScript, id)
	}
	m.scriptStatus[id] = "failed"
	m.scriptStatusInfo[id] = err.Error()
	m.mu.Unlock()
	m.appendLog(id, "system", fmt.Sprintf("启动 npm 脚本 %s 失败：%v", name, err))
	m.emitState(id)
}

func (m *serviceManager) waitForPackageScript(id string, process *processState, name string) {
	err := process.cmd.Wait()

	m.mu.Lock()
	current, ok := m.scriptProcesses[id]
	if !ok || current != process {
		m.mu.Unlock()
		close(process.done)
		return
	}
	delete(m.scriptProcesses, id)
	delete(m.activeScript, id)
	if process.stopping {
		m.scriptStatus[id] = "stopped"
		m.scriptStatusInfo[id] = ""
	} else if err != nil {
		m.scriptStatus[id] = "failed"
		m.scriptStatusInfo[id] = exitMessage(err)
	} else {
		m.scriptStatus[id] = "completed"
		m.scriptStatusInfo[id] = ""
	}
	status := m.scriptStatus[id]
	info := m.scriptStatusInfo[id]
	m.mu.Unlock()
	close(process.done)

	switch status {
	case "stopped":
		m.appendLog(id, "system", fmt.Sprintf("npm 脚本已停止：%s", name))
	case "failed":
		m.appendLog(id, "system", fmt.Sprintf("npm 脚本异常退出：%s", info))
	default:
		m.appendLog(id, "system", fmt.Sprintf("npm 脚本已完成：%s", name))
	}
	m.emitState(id)
}
