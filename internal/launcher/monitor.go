package launcher

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
	"time"
)

func (m *serviceManager) waitForProcess(id string, process *processState) {
	err := process.cmd.Wait()

	m.mu.Lock()
	current, ok := m.processes[id]
	if !ok || current != process {
		m.mu.Unlock()
		close(process.done)
		return
	}
	if process.stopping {
		m.mu.Unlock()
		close(process.done)
		return
	}
	delete(m.processes, id)
	m.health[id] = "stopped"
	m.healthInfo[id] = ""
	if err != nil {
		m.lastStatus[id] = "failed"
		m.lastError[id] = exitMessage(err)
	} else {
		m.lastStatus[id] = "stopped"
		m.lastError[id] = ""
	}
	status := m.lastStatus[id]
	message := m.lastError[id]
	m.mu.Unlock()
	close(process.done)

	if status == "failed" {
		m.appendLog(id, "system", message)
	} else {
		m.appendLog(id, "system", "服务已停止")
	}
	m.emitState(id)
}

func (m *serviceManager) captureOutput(id, stream string, reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	privateKey := false
	for scanner.Scan() {
		line := strings.TrimRight(ansiPattern.ReplaceAllString(scanner.Text(), ""), "\r")
		if strings.Contains(line, "-----BEGIN ") && strings.Contains(line, "PRIVATE KEY-----") {
			privateKey = true
		}
		if privateKey {
			privateKey = !(strings.Contains(line, "-----END ") && strings.Contains(line, "PRIVATE KEY-----"))
			line = redactedValue
		}
		m.appendLog(id, stream, line)
	}
	if err := scanner.Err(); err != nil {
		m.appendLog(id, "system", fmt.Sprintf("读取%s失败：%v", stream, err))
	}
}

func (m *serviceManager) monitorHealth(id string, process *processState, accessURL string) {
	ticker := time.NewTicker(m.healthEvery)
	defer ticker.Stop()
	for {
		ready, info := probeAccessURL(accessURL, m.healthTimeout)
		status := "ready"
		if !ready {
			m.mu.RLock()
			previous := m.health[id]
			m.mu.RUnlock()
			if previous == "ready" || time.Since(process.startedAt) >= m.healthGrace {
				status = "unreachable"
			} else {
				status = "checking"
			}
		}
		if !m.updateHealth(id, process, status, info) {
			return
		}
		select {
		case <-process.done:
			return
		case <-ticker.C:
		}
	}
}

func (m *serviceManager) updateHealth(id string, process *processState, status, info string) bool {
	m.mu.Lock()
	current, ok := m.processes[id]
	if !ok || current != process {
		m.mu.Unlock()
		return false
	}
	changed := m.health[id] != status || m.healthInfo[id] != info
	m.health[id] = status
	m.healthInfo[id] = info
	m.mu.Unlock()
	if changed {
		m.emitState(id)
	}
	return true
}

func probeAccessURL(accessURL string, timeout time.Duration) (bool, string) {
	parsed, err := url.Parse(accessURL)
	if err != nil {
		return false, "访问地址无效"
	}
	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	hostPort := net.JoinHostPort(parsed.Hostname(), port)
	connection, err := net.DialTimeout("tcp", hostPort, timeout)
	if err != nil {
		return false, fmt.Sprintf("等待 %s 响应", parsed.Host)
	}
	_ = connection.Close()
	return true, fmt.Sprintf("%s 可访问", parsed.Host)
}

func checkServicePort(accessURL string) error {
	if accessURL == "" {
		return nil
	}
	parsed, err := url.Parse(accessURL)
	if err != nil || parsed.Hostname() == "" {
		return fmt.Errorf("访问地址无效，无法检查端口")
	}
	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	command, pid := accessPortOwner(accessURL)
	if pid == 0 {
		return nil
	}
	inspectCommand := fmt.Sprintf("lsof -nP -iTCP:%s -sTCP:LISTEN", port)
	return fmt.Errorf("端口 %s 已被进程 %s (PID %d) 占用。\n检查命令：%s\n如确认可以停止：kill %d\n否则请修改服务的访问地址和启动命令，改用其他端口", port, command, pid, inspectCommand, pid)
}

func (m *serviceManager) appendLog(id, stream, text string) {
	text = redactLog(text)
	entry := LogEntry{
		ServiceID: id,
		Timestamp: time.Now().Format(time.RFC3339Nano),
		Stream:    stream,
		Text:      text,
	}
	m.mu.Lock()
	entries := append(m.logs[id], entry)
	if len(entries) > maxLogEntries {
		entries = append([]LogEntry(nil), entries[len(entries)-maxLogEntries:]...)
	}
	m.logs[id] = entries
	m.mu.Unlock()
	m.emitEvent("service:log", entry)
}

func (m *serviceManager) failStart(id string, err error) {
	m.mu.Lock()
	m.lastStatus[id] = "failed"
	m.lastError[id] = fmt.Sprintf("启动失败：%v", err)
	m.health[id] = "stopped"
	m.healthInfo[id] = ""
	m.mu.Unlock()
	m.appendLog(id, "system", fmt.Sprintf("启动失败：%v", err))
	m.emitState(id)
}

func (m *serviceManager) restoreRunningState(id string, process *processState, stopErr error) {
	m.mu.Lock()
	if current, ok := m.processes[id]; ok && current == process {
		process.stopping = false
		m.lastStatus[id] = "running"
		m.lastError[id] = fmt.Sprintf("停止失败：%v", stopErr)
	}
	m.mu.Unlock()
	m.emitState(id)
}

func (m *serviceManager) finalizeStoppedProcess(id string, process *processState) {
	m.mu.Lock()
	current, ok := m.processes[id]
	if !ok || current != process {
		m.mu.Unlock()
		return
	}
	delete(m.processes, id)
	m.lastStatus[id] = "stopped"
	m.lastError[id] = ""
	m.health[id] = "stopped"
	m.healthInfo[id] = ""
	m.mu.Unlock()
	m.appendLog(id, "system", "服务已停止")
	m.emitState(id)
}

func (m *serviceManager) emitState(id string) {
	m.mu.RLock()
	service, ok := m.serviceByIDLocked(id)
	if !ok {
		m.mu.RUnlock()
		return
	}
	view := m.serviceViewLocked(service)
	m.mu.RUnlock()
	m.emitEvent("service:state", view)
}

func (m *serviceManager) emitEvent(name string, payload any) {
	if m.emit != nil {
		m.emit(name, payload)
	}
}
