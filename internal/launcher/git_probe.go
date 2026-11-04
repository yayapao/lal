package launcher

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const gitProbeTimeout = 8 * time.Second
const maxGitFiles = 300

// Git subprocesses never run while holding the service-state lock.
func (m *serviceManager) GetGitStatuses() []GitStatus {
	m.mu.RLock()
	services := append([]Service(nil), m.services...)
	m.mu.RUnlock()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	statuses := make([]GitStatus, len(services))
	workers := make(chan struct{}, 4)
	var group sync.WaitGroup
	for index, service := range services {
		group.Add(1)
		go func(index int, service Service) {
			defer group.Done()
			select {
			case workers <- struct{}{}:
				defer func() { <-workers }()
			case <-ctx.Done():
				statuses[index] = gitFailure(service, "Git 探测超时")
				return
			}
			probeCtx, cancel := context.WithTimeout(ctx, gitProbeTimeout)
			defer cancel()
			statuses[index], _ = probeGit(probeCtx, service)
		}(index, service)
	}
	group.Wait()
	return statuses
}

func (m *serviceManager) GetServiceGitDetails(id string) (GitDetails, error) {
	service, err := m.serviceByID(id)
	if err != nil {
		return GitDetails{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), gitProbeTimeout)
	defer cancel()
	status, files := probeGit(ctx, service)
	details := GitDetails{Status: status, Files: files, Config: []GitConfigEntry{}, Truncated: status.Changed > len(files)}
	if status.Root == "" {
		return details, nil
	}
	if output, err := runGit(ctx, status.Root, "rev-parse", "--absolute-git-dir"); err == nil {
		details.GitDir = strings.TrimSuffix(string(output), "\n")
	}
	output, err := runGit(ctx, status.Root, "config", "--null", "--list", "--local")
	if err != nil {
		details.ConfigError = err.Error()
	} else {
		details.Config = parseGitConfig(output)
	}
	return details, nil
}

func gitFailure(service Service, message string) GitStatus {
	return GitStatus{ServiceID: service.ID, Directory: service.Directory, State: "error", Error: message, CheckedAt: time.Now().Format(time.RFC3339)}
}

func probeGit(ctx context.Context, service Service) (GitStatus, []GitChange) {
	status := gitFailure(service, "")
	files := []GitChange{}
	if !isDirectory(service.Directory) {
		status.Error = "项目目录不存在或无法访问"
		return status, files
	}
	output, err := runGit(ctx, service.Directory, "rev-parse", "--show-toplevel")
	if err != nil {
		if strings.Contains(err.Error(), "not a git repository") && !hasGitMarker(service.Directory) {
			status.State = "not_repository"
		} else {
			status.Error = err.Error()
		}
		return status, files
	}
	status.Root = strings.TrimSuffix(string(output), "\n")
	output, err = runGit(ctx, status.Root, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=none")
	if err == nil {
		files, err = parseGitStatus(output, &status)
	}
	if err != nil {
		status.Error = err.Error()
		return status, []GitChange{}
	}
	status.State = "clean"
	if status.Changed > 0 {
		status.State = "dirty"
	}
	return status, files
}

func hasGitMarker(directory string) bool {
	directory, _ = filepath.Abs(directory)
	for {
		if _, err := os.Lstat(filepath.Join(directory, ".git")); err == nil || !os.IsNotExist(err) {
			return true
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return false
		}
		directory = parent
	}
}

// Bound command output and runtime. Optional locks and fsmonitor are disabled
// so background inspection does not update the index or run a monitor hook.
func runGit(ctx context.Context, directory string, args ...string) ([]byte, error) {
	arguments := append([]string{"--no-optional-locks", "-c", "core.fsmonitor=false", "-C", directory}, args...)
	cmd := exec.CommandContext(ctx, "git", arguments...)
	cmd.Env = gitEnvironment()
	cmd.WaitDelay = 500 * time.Millisecond
	output := &gitOutput{limit: 8 * 1024 * 1024}
	stderr := &gitOutput{limit: 16 * 1024}
	cmd.Stdout, cmd.Stderr = output, stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("Git 探测超时")
		}
		if output.exceeded || stderr.exceeded {
			return nil, fmt.Errorf("Git 输出过大，无法完整读取")
		}
		return nil, fmt.Errorf("%s", commandError(stderr.Bytes(), err))
	}
	return output.Bytes(), nil
}

func gitEnvironment() []string {
	environment := []string{}
	for _, entry := range os.Environ() {
		if !strings.HasPrefix(entry, "GIT_") && !strings.HasPrefix(entry, "LC_ALL=") {
			environment = append(environment, entry)
		}
	}
	return append(environment, "LC_ALL=C", "GIT_OPTIONAL_LOCKS=0", "GIT_TERMINAL_PROMPT=0")
}

type gitOutput struct {
	bytes.Buffer
	limit    int
	exceeded bool
}

func (output *gitOutput) Write(data []byte) (int, error) {
	if output.Len()+len(data) > output.limit {
		output.exceeded = true
		return 0, fmt.Errorf("Git 输出过大")
	}
	return output.Buffer.Write(data)
}
