package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"
)

const (
	configVersion         = 4
	maxLogEntries         = 1200
	maxCommandLength      = 1000
	maxCleanCommandLength = 2000
	maxPromptFileLength   = 1000
	maxPromptFileBytes    = 2 * 1024 * 1024
	stopTimeout           = 8 * time.Second
	healthGrace           = 12 * time.Second
	healthEvery           = 1 * time.Second
	healthTimeout         = 500 * time.Millisecond
	defaultCleanCommand   = "rm -rf .next"
	defaultPromptsDir     = "prompts"
)

var ansiPattern = regexp.MustCompile(`\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])`)

const shellCommandWrapper = `if [[ -r "$HOME/.zshrc" ]]; then source "$HOME/.zshrc"; fi; eval "$1"`

type Service struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Directory    string   `json:"directory"`
	Command      string   `json:"command"`
	URL          string   `json:"url,omitempty"`
	CleanCommand string   `json:"cleanCommand"`
	PromptFiles  []string `json:"promptFiles,omitempty"`
	PromptFile   string   `json:"promptFile,omitempty"` // v4 migration only
}

type ServiceInput struct {
	Name         string `json:"name"`
	Directory    string `json:"directory"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	CleanCommand string `json:"cleanCommand"`
}

type ServiceView struct {
	Service
	ProjectType string `json:"projectType"`
	Status      string `json:"status"`
	PID         int    `json:"pid"`
	StartedAt   string `json:"startedAt"`
	LastError   string `json:"lastError"`
	PathExists  bool   `json:"pathExists"`
	Health      string `json:"health"`
	HealthInfo  string `json:"healthInfo"`
}

type PromptFileView struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	DisplayPath string `json:"displayPath"`
	Content     string `json:"content"`
	Source      string `json:"source"`
	Error       string `json:"error"`
}

type AppState struct {
	Services   []ServiceView `json:"services"`
	ConfigPath string        `json:"configPath"`
	Warning    string        `json:"warning"`
}

type LogEntry struct {
	ServiceID string `json:"serviceId"`
	Timestamp string `json:"timestamp"`
	Stream    string `json:"stream"`
	Text      string `json:"text"`
}

type BatchResult struct {
	Changed int      `json:"changed"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors"`
}

type ResourceUsage struct {
	ServiceID    string  `json:"serviceId"`
	CPUPercent   float64 `json:"cpuPercent"`
	MemoryBytes  uint64  `json:"memoryBytes"`
	ProcessCount int     `json:"processCount"`
}

type configFile struct {
	Version  int       `json:"version"`
	Services []Service `json:"services"`
}

type processState struct {
	cmd       *exec.Cmd
	startedAt time.Time
	done      chan struct{}
	stopping  bool
}

type serviceManager struct {
	mu            sync.RWMutex
	configPath    string
	services      []Service
	processes     map[string]*processState
	lastStatus    map[string]string
	lastError     map[string]string
	health        map[string]string
	healthInfo    map[string]string
	logs          map[string][]LogEntry
	configWarn    string
	emit          func(string, any)
	stopTimeout   time.Duration
	healthGrace   time.Duration
	healthEvery   time.Duration
	healthTimeout time.Duration
	commandShell  string
	commandArgs   []string
}

func defaultConfigPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "LAL", "config.json")
	}
	return filepath.Join(dir, "LAL", "config.json")
}

func newServiceManager(configPath string) *serviceManager {
	m := &serviceManager{
		configPath:    configPath,
		processes:     make(map[string]*processState),
		lastStatus:    make(map[string]string),
		lastError:     make(map[string]string),
		health:        make(map[string]string),
		healthInfo:    make(map[string]string),
		logs:          make(map[string][]LogEntry),
		stopTimeout:   stopTimeout,
		healthGrace:   healthGrace,
		healthEvery:   healthEvery,
		healthTimeout: healthTimeout,
		commandShell:  "/bin/zsh",
		commandArgs:   []string{"-lc", shellCommandWrapper, "lal"},
	}
	if err := m.loadConfig(); err != nil {
		m.configWarn = err.Error()
	}
	return m
}

func (m *serviceManager) loadConfig() error {
	data, err := os.ReadFile(m.configPath)
	if errors.Is(err, os.ErrNotExist) {
		m.services = defaultServices()
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
		service.URL = normalizeAccessURL(service.URL)
		if strings.TrimSpace(service.CleanCommand) == "" {
			service.CleanCommand = defaultCleanCommand
		}
		if legacyPrompt := strings.TrimSpace(service.PromptFile); legacyPrompt != "" && filepath.Clean(legacyPrompt) != filepath.Join(defaultPromptsDir, "codex-startup.md") {
			service.PromptFiles = append(service.PromptFiles, legacyPrompt)
		}
		service.PromptFile = ""
		service.PromptFiles = normalizePromptFiles(service.PromptFiles)
		if migrating && service.URL == "" {
			service.URL = knownServiceURL(service.Directory)
		}
		if err := validateService(service); err != nil {
			return fmt.Errorf("服务 %q 的配置无效：%w", service.Name, err)
		}
		if !serviceEqual(service, original) {
			config.Services[index] = service
			changed = true
		}
	}
	m.services = append([]Service(nil), config.Services...)
	if changed {
		return m.saveConfigLocked()
	}
	return nil
}

func defaultServices() []Service {
	candidates := []Service{
		{ID: "mystock", Name: "myStock", Directory: "/Users/yango/github/stock/mystock", Command: "npm run dev", URL: "http://localhost:35790", CleanCommand: defaultCleanCommand},
		{ID: "viewai", Name: "ViewAI", Directory: "/Users/yango/Documents/huyaprojects/ai/viewai", Command: "npm run dev", URL: "http://localhost:3900", CleanCommand: defaultCleanCommand},
	}
	services := make([]Service, 0, len(candidates))
	for _, candidate := range candidates {
		if isDirectory(candidate.Directory) {
			services = append(services, candidate)
		}
	}
	return services
}

func (m *serviceManager) GetAppState() AppState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return AppState{
		Services:   m.serviceViewsLocked(),
		ConfigPath: m.configPath,
		Warning:    m.configWarn,
	}
}

func (m *serviceManager) CreateService(input ServiceInput) (ServiceView, error) {
	service := Service{
		ID:           newID(),
		Name:         strings.TrimSpace(input.Name),
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
	previous := append([]Service(nil), m.services...)
	m.services = append(m.services[:index], m.services[index+1:]...)
	if err := m.saveConfigLocked(); err != nil {
		m.services = previous
		m.mu.Unlock()
		return err
	}
	delete(m.logs, id)
	delete(m.lastStatus, id)
	delete(m.lastError, id)
	delete(m.health, id)
	delete(m.healthInfo, id)
	m.mu.Unlock()
	m.emitEvent("services:changed", map[string]string{"deletedId": id})
	return nil
}

func (m *serviceManager) StartService(id string) error {
	m.mu.Lock()
	service, ok := m.serviceByIDLocked(id)
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("服务不存在")
	}
	if _, running := m.processes[id]; running {
		m.mu.Unlock()
		return nil
	}
	if m.lastStatus[id] == "starting" {
		m.mu.Unlock()
		return nil
	}
	if !isDirectory(service.Directory) {
		m.lastStatus[id] = "failed"
		m.lastError[id] = "项目目录不存在"
		m.mu.Unlock()
		m.emitState(id)
		return fmt.Errorf("项目目录不存在：%s", service.Directory)
	}
	m.lastStatus[id] = "starting"
	m.lastError[id] = ""
	m.mu.Unlock()
	m.emitState(id)
	if err := checkServicePort(service.URL); err != nil {
		m.failStart(id, err)
		return err
	}
	m.ClearLogs(id)

	args := append(append([]string(nil), m.commandArgs...), service.Command)
	cmd := exec.Command(m.commandShell, args...)
	cmd.Dir = service.Directory
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.failStart(id, err)
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.failStart(id, err)
		return err
	}
	if err := cmd.Start(); err != nil {
		m.failStart(id, err)
		return fmt.Errorf("启动失败：%w", err)
	}

	process := &processState{cmd: cmd, startedAt: time.Now(), done: make(chan struct{})}
	m.mu.Lock()
	m.processes[id] = process
	m.lastStatus[id] = "running"
	m.lastError[id] = ""
	if service.URL == "" {
		m.health[id] = "not_configured"
		m.healthInfo[id] = ""
	} else {
		m.health[id] = "checking"
		m.healthInfo[id] = "等待访问地址响应"
	}
	m.mu.Unlock()
	m.appendLog(id, "system", fmt.Sprintf("已启动：%s", service.Command))
	m.emitState(id)

	go m.captureOutput(id, "stdout", stdout)
	go m.captureOutput(id, "stderr", stderr)
	go m.waitForProcess(id, process)
	if service.URL != "" {
		go m.monitorHealth(id, process, service.URL)
	}
	return nil
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
	m.appendLog(id, "system", "正在停止服务…")

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
	if status == "starting" || status == "stopping" {
		return fmt.Errorf("服务正在%s，请稍后再试", map[string]string{"starting": "启动", "stopping": "停止"}[status])
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
	if status == "starting" || status == "stopping" {
		return fmt.Errorf("服务正在%s，请稍后再试", map[string]string{"starting": "启动", "stopping": "停止"}[status])
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

func (m *serviceManager) StartAll() BatchResult {
	return m.StartServices(m.serviceIDs())
}

func (m *serviceManager) StartServices(ids []string) BatchResult {
	result := BatchResult{}
	for _, id := range uniqueIDs(ids) {
		service, err := m.serviceByID(id)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if m.isRunningOrStarting(id) {
			result.Skipped++
			continue
		}
		if err := m.StartService(id); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s：%v", service.Name, err))
			continue
		}
		result.Changed++
	}
	return result
}

func (m *serviceManager) StopAll() BatchResult {
	return m.StopServices(m.serviceIDs())
}

func (m *serviceManager) StopServices(ids []string) BatchResult {
	result := BatchResult{}
	for _, id := range uniqueIDs(ids) {
		service, err := m.serviceByID(id)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if !m.isStoppable(id) {
			result.Skipped++
			continue
		}
		if err := m.StopService(id); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s：%v", service.Name, err))
			continue
		}
		result.Changed++
	}
	return result
}

func (m *serviceManager) GetLogs(id string) []LogEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]LogEntry(nil), m.logs[id]...)
}

func (m *serviceManager) ClearLogs(id string) {
	m.mu.Lock()
	m.logs[id] = nil
	m.mu.Unlock()
	m.emitEvent("service:logs-cleared", map[string]string{"serviceId": id})
}

func (m *serviceManager) GetResourceUsage() ([]ResourceUsage, error) {
	m.mu.RLock()
	serviceIDs := make([]string, 0, len(m.services))
	groupServiceIDs := make(map[int]string, len(m.processes))
	for _, service := range m.services {
		serviceIDs = append(serviceIDs, service.ID)
		if process, running := m.processes[service.ID]; running && process.cmd.Process != nil {
			groupServiceIDs[process.cmd.Process.Pid] = service.ID
		}
	}
	m.mu.RUnlock()

	if len(groupServiceIDs) == 0 {
		return parseResourceUsage("", groupServiceIDs, serviceIDs), nil
	}
	cmd := exec.Command("/bin/ps", "-axo", "pgid=,%cpu=,rss=")
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("读取资源使用情况失败：%w", err)
	}
	return parseResourceUsage(string(output), groupServiceIDs, serviceIDs), nil
}

func parseResourceUsage(output string, groupServiceIDs map[int]string, serviceIDs []string) []ResourceUsage {
	usageByID := make(map[string]*ResourceUsage, len(serviceIDs))
	for _, id := range serviceIDs {
		usageByID[id] = &ResourceUsage{ServiceID: id}
	}

	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) != 3 {
			continue
		}
		groupID, groupErr := strconv.Atoi(fields[0])
		serviceID, tracked := groupServiceIDs[groupID]
		cpu, cpuErr := strconv.ParseFloat(fields[1], 64)
		memoryKB, memoryErr := strconv.ParseUint(fields[2], 10, 64)
		usage, known := usageByID[serviceID]
		if groupErr != nil || !tracked || cpuErr != nil || memoryErr != nil || !known {
			continue
		}
		usage.CPUPercent += max(cpu, 0)
		usage.MemoryBytes += memoryKB * 1024
		usage.ProcessCount++
	}

	result := make([]ResourceUsage, 0, len(usageByID))
	for _, usage := range usageByID {
		result = append(result, *usage)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ServiceID < result[j].ServiceID })
	return result
}

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
	view := ServiceView{
		Service:     service,
		ProjectType: detectProjectType(service.Directory, service.Command),
		Status:      m.lastStatus[service.ID],
		LastError:   m.lastError[service.ID],
		PathExists:  isDirectory(service.Directory),
		Health:      "stopped",
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
	return view
}

func (m *serviceManager) GetPrompts(id string) ([]PromptFileView, error) {
	service, err := m.serviceByID(id)
	if err != nil {
		return nil, err
	}
	paths, err := promptPaths(service)
	if err != nil {
		return nil, err
	}
	prompts := make([]PromptFileView, 0, len(paths))
	for _, item := range paths {
		prompt := PromptFileView{
			Name:        filepath.Base(item.path),
			Path:        item.path,
			DisplayPath: displayPromptPath(service.Directory, item.path),
			Source:      item.source,
		}
		prompt.Content, prompt.Error = readPromptPath(item.path)
		prompts = append(prompts, prompt)
	}
	sort.SliceStable(prompts, func(i, j int) bool {
		if prompts[i].Source != prompts[j].Source {
			return prompts[i].Source == "project"
		}
		return strings.ToLower(prompts[i].DisplayPath) < strings.ToLower(prompts[j].DisplayPath)
	})
	return prompts, nil
}

func (m *serviceManager) AddPromptFile(id, path string) error {
	service, err := m.serviceByID(id)
	if err != nil {
		return err
	}
	path, err = filepath.Abs(strings.TrimSpace(path))
	if err != nil || path == "" {
		return fmt.Errorf("Prompt 文件路径无效")
	}
	path = filepath.Clean(path)
	if len(path) > maxPromptFileLength {
		return fmt.Errorf("Prompt 文件路径不能超过 %d 个字符", maxPromptFileLength)
	}
	if _, readError := readPromptPath(path); readError != "" {
		return errors.New(readError)
	}
	if pathWithin(filepath.Join(service.Directory, defaultPromptsDir), path) {
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		return fmt.Errorf("服务不存在")
	}
	for _, existing := range m.services[index].PromptFiles {
		if resolvePromptPath(m.services[index].Directory, existing) == path {
			return nil
		}
	}
	previous := append([]string(nil), m.services[index].PromptFiles...)
	m.services[index].PromptFiles = append(m.services[index].PromptFiles, path)
	if err := m.saveConfigLocked(); err != nil {
		m.services[index].PromptFiles = previous
		return err
	}
	return nil
}

func (m *serviceManager) RemovePromptFile(id, path string) error {
	path = filepath.Clean(strings.TrimSpace(path))
	m.mu.Lock()
	defer m.mu.Unlock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		return fmt.Errorf("服务不存在")
	}
	service := m.services[index]
	for promptIndex, configured := range service.PromptFiles {
		if resolvePromptPath(service.Directory, configured) != path {
			continue
		}
		previous := append([]string(nil), service.PromptFiles...)
		m.services[index].PromptFiles = append(service.PromptFiles[:promptIndex], service.PromptFiles[promptIndex+1:]...)
		if err := m.saveConfigLocked(); err != nil {
			m.services[index].PromptFiles = previous
			return err
		}
		return nil
	}
	return fmt.Errorf("项目 prompts 目录下的文件由 LAL 自动发现，无法移除关联")
}

func (m *serviceManager) readCodexPrompt(id, path string) (string, error) {
	service, err := m.serviceByID(id)
	if err != nil {
		return "", err
	}
	configured, err := promptPaths(service)
	if err != nil {
		return "", err
	}
	path = filepath.Clean(strings.TrimSpace(path))
	if !slices.ContainsFunc(configured, func(item promptPath) bool { return item.path == path }) {
		return "", fmt.Errorf("该 Prompt 未关联到服务 %s", service.Name)
	}
	prompt, readError := readPromptPath(path)
	if readError != "" {
		return "", errors.New(readError)
	}
	return prompt, nil
}

func readPromptPath(path string) (string, string) {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Sprintf("未找到 Prompt 文件：%s", path)
		}
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Sprintf("Prompt 不是普通文件：%s", path)
	}
	if info.Size() > maxPromptFileBytes {
		return "", "Prompt 文件不能超过 2 MB"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	if !utf8.Valid(data) {
		return "", "Prompt 文件必须是 UTF-8 文本"
	}
	prompt := string(data)
	if strings.TrimSpace(prompt) == "" {
		return "", fmt.Sprintf("Prompt 文件为空：%s", path)
	}
	return prompt, ""
}

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
	for scanner.Scan() {
		line := strings.TrimRight(ansiPattern.ReplaceAllString(scanner.Text(), ""), "\r")
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
	command, pid := tcpPortOwner(port)
	if pid == 0 {
		return nil
	}
	inspectCommand := fmt.Sprintf("lsof -nP -iTCP:%s -sTCP:LISTEN", port)
	return fmt.Errorf("端口 %s 已被进程 %s (PID %d) 占用。\n检查命令：%s\n如确认可以停止：kill %d\n否则请修改服务的访问地址和启动命令，改用其他端口", port, command, pid, inspectCommand, pid)
}

func tcpPortOwner(port string) (string, int) {
	output, err := exec.Command("/usr/sbin/lsof", "-nP", "-iTCP:"+port, "-sTCP:LISTEN", "-Fpc").Output()
	if err != nil {
		return "未知进程", 0
	}
	command := "未知进程"
	pid := 0
	for _, line := range strings.Split(string(output), "\n") {
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			if pid == 0 {
				pid, _ = strconv.Atoi(line[1:])
			}
		case 'c':
			if command == "未知进程" {
				command = line[1:]
			}
		}
		if pid > 0 && command != "未知进程" {
			break
		}
	}
	return command, pid
}

func (m *serviceManager) appendLog(id, stream, text string) {
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
	if err := encoder.Encode(configFile{Version: configVersion, Services: m.services}); err != nil {
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

func isDirectory(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

type packageManifest struct {
	Dependencies    map[string]json.RawMessage `json:"dependencies"`
	DevDependencies map[string]json.RawMessage `json:"devDependencies"`
	Scripts         map[string]string          `json:"scripts"`
}

func detectProjectType(directory, command string) string {
	hasPackageManifest := false
	manifestPath := filepath.Join(directory, "package.json")
	if data, err := os.ReadFile(manifestPath); err == nil && len(data) <= 2*1024*1024 {
		var manifest packageManifest
		if json.Unmarshal(data, &manifest) == nil {
			hasPackageManifest = true
			dependencies := make(map[string]struct{}, len(manifest.Dependencies)+len(manifest.DevDependencies))
			for name := range manifest.Dependencies {
				dependencies[name] = struct{}{}
			}
			for name := range manifest.DevDependencies {
				dependencies[name] = struct{}{}
			}
			for _, candidate := range []struct {
				projectType string
				packages    []string
			}{
				{projectType: "nextjs", packages: []string{"next"}},
				{projectType: "vite", packages: []string{"vite"}},
				{projectType: "angular", packages: []string{"@angular/core"}},
				{projectType: "vue", packages: []string{"vue"}},
				{projectType: "svelte", packages: []string{"svelte"}},
				{projectType: "react", packages: []string{"react", "react-dom"}},
			} {
				for _, packageName := range candidate.packages {
					if _, found := dependencies[packageName]; found {
						return candidate.projectType
					}
				}
			}
			for _, script := range manifest.Scripts {
				if strings.Contains(strings.ToLower(script), "next") {
					return "nextjs"
				}
			}
		}
	}

	for _, filename := range []string{"next.config.js", "next.config.mjs", "next.config.ts"} {
		if isFile(filepath.Join(directory, filename)) {
			return "nextjs"
		}
	}
	if isDirectory(filepath.Join(directory, ".next")) || strings.Contains(strings.ToLower(command), "next") {
		return "nextjs"
	}
	if isFile(filepath.Join(directory, "go.mod")) {
		return "go"
	}
	if isFile(filepath.Join(directory, "Cargo.toml")) {
		return "rust"
	}
	if isFile(filepath.Join(directory, "pyproject.toml")) || isFile(filepath.Join(directory, "requirements.txt")) {
		return "python"
	}
	if hasPackageManifest {
		return "node"
	}
	return "generic"
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func cleanDirectory(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	return filepath.Clean(path)
}

func normalizeAccessURL(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	return strings.TrimRight(value, "/")
}

func normalizeCleanCommand(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultCleanCommand
	}
	return value
}

func normalizePromptFiles(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		value = filepath.Clean(value)
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func resolvePromptPath(directory, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Join(directory, path)
}

type promptPath struct {
	path   string
	source string
}

func promptPaths(service Service) ([]promptPath, error) {
	paths := make([]promptPath, 0)
	seen := make(map[string]struct{})
	promptsRoot := filepath.Join(service.Directory, defaultPromptsDir)
	if err := filepath.WalkDir(promptsRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if strings.HasPrefix(entry.Name(), ".") {
			if entry.IsDir() && path != promptsRoot {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() || !isPromptFilename(entry.Name()) {
			return nil
		}
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		path = filepath.Clean(path)
		seen[path] = struct{}{}
		paths = append(paths, promptPath{path: path, source: "project"})
		return nil
	}); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("扫描 prompts 目录失败：%w", err)
	}
	for _, configured := range service.PromptFiles {
		path := resolvePromptPath(service.Directory, configured)
		if _, exists := seen[path]; exists {
			continue
		}
		seen[path] = struct{}{}
		paths = append(paths, promptPath{path: path, source: "added"})
	}
	return paths, nil
}

func isPromptFilename(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md", ".markdown", ".txt", ".prompt":
		return true
	default:
		return false
	}
}

func displayPromptPath(directory, path string) string {
	if relative, err := filepath.Rel(directory, path); err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return relative
	}
	return path
}

func pathWithin(root, path string) bool {
	relative, err := filepath.Rel(filepath.Clean(root), filepath.Clean(path))
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func serviceEqual(left, right Service) bool {
	return left.ID == right.ID && left.Name == right.Name && left.Directory == right.Directory && left.Command == right.Command &&
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
