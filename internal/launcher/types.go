package launcher

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	configVersion         = 6
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
	maxScriptNameLength   = 120
	maxIconFileBytes      = 2 * 1024 * 1024
	moduleService         = "service"
	moduleGame            = "game"
)

var ansiPattern = regexp.MustCompile(`\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])`)

const shellCommandWrapper = `if [[ -r "$HOME/.zshrc" ]]; then source "$HOME/.zshrc"; fi; eval "$1"`

type Service struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Module       string   `json:"module,omitempty"`
	Workspace    string   `json:"workspace,omitempty"`
	Directory    string   `json:"directory"`
	Command      string   `json:"command"`
	URL          string   `json:"url,omitempty"`
	CleanCommand string   `json:"cleanCommand"`
	PromptFiles  []string `json:"promptFiles,omitempty"`
	PromptFile   string   `json:"promptFile,omitempty"` // v4 migration only
}

type ServiceInput struct {
	Name         string `json:"name"`
	Module       string `json:"module"`
	Workspace    string `json:"workspace"`
	Directory    string `json:"directory"`
	Command      string `json:"command"`
	URL          string `json:"url"`
	CleanCommand string `json:"cleanCommand"`
}

type ServiceView struct {
	Service
	PackageInfo         *PackageInfo `json:"packageInfo,omitempty"`
	IconPath            string       `json:"iconPath,omitempty"`
	IconVersion         string       `json:"iconVersion,omitempty"`
	ConfiguredWorkspace string       `json:"configuredWorkspace,omitempty"`
	ActiveScript        string       `json:"activeScript,omitempty"`
	ScriptStatus        string       `json:"scriptStatus,omitempty"`
	ScriptStatusInfo    string       `json:"scriptStatusInfo,omitempty"`
	ProjectType         string       `json:"projectType"`
	Status              string       `json:"status"`
	PID                 int          `json:"pid"`
	StartedAt           string       `json:"startedAt"`
	LastError           string       `json:"lastError"`
	PathExists          bool         `json:"pathExists"`
	Health              string       `json:"health"`
	HealthInfo          string       `json:"healthInfo"`
	Port                *PortView    `json:"port,omitempty"`
}

type PromptFileView struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	DisplayPath string `json:"displayPath"`
	Content     string `json:"content"`
	Source      string `json:"source"`
	Error       string `json:"error"`
}

type PackageScript struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

type PackageInfo struct {
	Name           string          `json:"name,omitempty"`
	Version        string          `json:"version,omitempty"`
	Description    string          `json:"description,omitempty"`
	PackageManager string          `json:"packageManager,omitempty"`
	Scripts        []PackageScript `json:"scripts,omitempty"`
}

type AppState struct {
	Services   []ServiceView `json:"services"`
	Workspaces []string      `json:"workspaces"`
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
	Version    int       `json:"version"`
	Services   []Service `json:"services"`
	Workspaces []string  `json:"workspaces"`
}

type processState struct {
	cmd       *exec.Cmd
	startedAt time.Time
	done      chan struct{}
	stopping  bool
}

type orderedScripts struct {
	values map[string]string
	order  []string
}

func (scripts *orderedScripts) UnmarshalJSON(data []byte) error {
	scripts.values = make(map[string]string)
	scripts.order = nil
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	if delimiter, ok := token.(json.Delim); !ok || delimiter != '{' {
		return fmt.Errorf("scripts must be an object")
	}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		name, ok := token.(string)
		if !ok {
			return fmt.Errorf("script name must be a string")
		}
		var command string
		if err := decoder.Decode(&command); err != nil {
			return err
		}
		if _, exists := scripts.values[name]; !exists {
			scripts.order = append(scripts.order, name)
		}
		scripts.values[name] = command
	}
	_, err = decoder.Token()
	return err
}

type serviceManager struct {
	mu               sync.RWMutex
	configPath       string
	services         []Service
	workspaces       []string
	processes        map[string]*processState
	lastStatus       map[string]string
	lastError        map[string]string
	health           map[string]string
	healthInfo       map[string]string
	scriptProcesses  map[string]*processState
	activeScript     map[string]string
	scriptStatus     map[string]string
	scriptStatusInfo map[string]string
	logs             map[string][]LogEntry
	configWarn       string
	emit             func(string, any)
	stopTimeout      time.Duration
	healthGrace      time.Duration
	healthEvery      time.Duration
	healthTimeout    time.Duration
	commandShell     string
	commandArgs      []string
}
