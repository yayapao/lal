package launcher

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func detectedGameBuild(directory string) (string, bool) {
	var manifest lalProjectManifest
	if json.Unmarshal([]byte(readDetectionText(filepath.Join(directory, lalManifestFilename))), &manifest) != nil {
		return "", false
	}
	command := strings.TrimSpace(manifest.BuildCommand)
	if command == "" || len(command) > maxCleanCommandLength {
		return "", false
	}
	return command, manifest.BuildBeforeLaunch == nil || *manifest.BuildBeforeLaunch
}

// BuildGame exports a fresh Release without launching it.
func (m *serviceManager) BuildGame(id string) error {
	return m.startManagedService(id, true)
}

func (m *serviceManager) startManagedService(id string, buildOnly bool) error {
	return m.startGameProcess(id, buildOnly, "")
}

func (m *serviceManager) startGameProcess(id string, buildOnly bool, profileID string) error {
	m.mu.Lock()
	service, ok := m.serviceByIDLocked(id)
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("服务不存在")
	}
	if _, running := m.processes[id]; running {
		m.mu.Unlock()
		if buildOnly {
			return fmt.Errorf("请先停止游戏或等待当前构建完成")
		}
		return nil
	}
	if service.Module == moduleGame {
		if _, running := m.scriptProcesses[id]; running {
			m.mu.Unlock()
			return fmt.Errorf("请先停止正在执行的 npm 脚本")
		}
	}
	building := buildOnly || (service.Module == moduleGame && service.LaunchMode == "release" && service.BuildBeforeLaunch)
	if session := m.godotWeb[id]; building && session != nil && session.server != nil {
		m.mu.Unlock()
		return fmt.Errorf("请先停止浏览器服务再构建游戏")
	}
	var command, buildName string
	var err error
	status := "running"
	if building {
		command, buildName, err = gameBuildCommand(service, profileID)
		status = "building"
	}
	if !buildOnly && err == nil {
		launch, launchErr := launchCommand(service)
		err = launchErr
		if !building {
			command = launch
		}
	}
	if err == nil && !isDirectory(service.Directory) {
		err = fmt.Errorf("项目目录不存在：%s", service.Directory)
	}
	if err == nil && !buildOnly {
		err = checkServicePort(managedAccessURL(service))
	}
	if err != nil {
		m.mu.Unlock()
		m.failStart(id, err)
		return err
	}
	m.logs[id] = nil
	process, err := m.launchProcessLocked(service, command, status)
	if err == nil {
		process.buildName = buildName
	}
	m.mu.Unlock()
	if err != nil {
		m.failStart(id, err)
		return err
	}
	m.emitEvent("service:logs-cleared", map[string]string{"serviceId": id})
	if building {
		m.appendLog(id, "system", "开始构建并导出 ["+buildName+"]："+command)
		m.emitState(id)
		go m.waitForGameBuild(service, process, !buildOnly)
	} else {
		m.watchLaunchedProcess(service, process, command)
	}
	return nil
}

// The caller holds mu through process registration, including build-to-launch
// handoff, so stop, edit and duplicate starts cannot race that handoff.
func (m *serviceManager) launchProcessLocked(service Service, command, status string) (*processState, error) {
	if m.shuttingDown {
		return nil, fmt.Errorf("LAL 正在退出，无法启动新进程")
	}
	args := append(append([]string(nil), m.commandArgs...), command)
	cmd := exec.Command(m.commandShell, args...)
	cmd.Dir = service.Directory
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		stdout.Close()
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		stdout.Close()
		stderr.Close()
		return nil, fmt.Errorf("启动命令失败：%w", err)
	}
	process := &processState{cmd: cmd, startedAt: time.Now(), done: make(chan struct{}), phase: status, command: command}
	m.processes[service.ID] = process
	m.lastStatus[service.ID] = status
	m.lastError[service.ID] = ""
	m.health[service.ID] = "not_configured"
	m.healthInfo[service.ID] = ""
	if status == "running" && managedAccessURL(service) != "" {
		m.health[service.ID] = "checking"
		m.healthInfo[service.ID] = "等待访问地址响应"
	}
	go m.captureOutput(service.ID, "stdout", stdout)
	go m.captureOutput(service.ID, "stderr", stderr)
	return process, nil
}

func (m *serviceManager) watchLaunchedProcess(service Service, process *processState, command string) {
	m.appendLog(service.ID, "system", fmt.Sprintf("已启动%s：%s", launchModeLabel(service), command))
	m.emitState(service.ID)
	go m.waitForProcess(service.ID, process)
	if managedAccessURL(service) != "" {
		go m.monitorHealth(service.ID, process, service.URL)
	}
}

func (m *serviceManager) waitForGameBuild(service Service, process *processState, launch bool) {
	err := process.cmd.Wait()
	message := "构建并导出完成"
	if err != nil {
		message = "构建并导出失败：" + exitMessage(err)
	}
	message = "[" + process.buildName + "] " + message
	id := service.ID
	m.mu.Lock()
	if m.processes[id] != process || process.stopping {
		m.mu.Unlock()
		close(process.done)
		return
	}
	var next *processState
	if err == nil && launch {
		err = checkServicePort(managedAccessURL(service))
		if err == nil {
			next, err = m.launchProcessLocked(service, service.ReleaseCommand, "running")
		}
		if err != nil {
			message = "构建已完成，正式启动失败：" + err.Error()
		}
	}
	if next == nil {
		delete(m.processes, id)
		m.health[id] = "stopped"
		m.healthInfo[id] = ""
		m.lastStatus[id] = "built"
		if err != nil {
			m.lastStatus[id] = "failed"
			m.lastError[id] = message
		}
	}
	m.mu.Unlock()
	close(process.done)
	m.appendLog(id, "system", message)
	if next != nil {
		m.watchLaunchedProcess(service, next, service.ReleaseCommand)
	} else {
		m.emitState(id)
	}
}
