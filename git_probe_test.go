package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func testGit(t *testing.T, directory string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", directory}, args...)...)
	cmd.Env = append(gitEnvironment(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v: %s", args, err, output)
	}
	return strings.TrimSpace(string(output))
}

func testGitRepo(t *testing.T) string {
	t.Helper()
	directory := t.TempDir()
	testGit(t, directory, "init", "--initial-branch=main")
	testGit(t, directory, "config", "user.name", "LAL Test")
	testGit(t, directory, "config", "user.email", "lal@example.test")
	testGit(t, directory, "config", "commit.gpgsign", "false")
	writeGitFile(t, directory, "tracked.txt", "initial\n")
	testGit(t, directory, "add", ".")
	testGit(t, directory, "commit", "-m", "Initial")
	return directory
}

func writeGitFile(t *testing.T, directory, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestGitProbeCleanDirtyAndLocalConfig(t *testing.T) {
	directory := testGitRepo(t)
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Git project", Directory: directory, Command: "echo ready"})
	if err != nil {
		t.Fatal(err)
	}
	details, err := app.GetServiceGitDetails(service.ID)
	if err != nil || details.Status.State != "clean" || details.Status.Branch != "main" || details.GitDir == "" {
		t.Fatalf("clean details = %+v, %v", details, err)
	}
	// Preserve special filenames and count a file staged and modified again once.
	writeGitFile(t, directory, "tracked.txt", "staged\n")
	testGit(t, directory, "add", "tracked.txt")
	writeGitFile(t, directory, "tracked.txt", "unstaged\n")
	writeGitFile(t, directory, "new file\n中文.txt", "untracked")
	testGit(t, directory, "config", "--add", "lal.multiline", "first\nsecond=value")
	testGit(t, directory, "config", "--add", "lal.multiline", "another")
	testGit(t, directory, "config", "lal.empty", "")
	details, err = app.GetServiceGitDetails(service.ID)
	if err != nil {
		t.Fatal(err)
	}
	status := details.Status
	if status.State != "dirty" || status.Changed != 2 || status.Staged != 1 || status.Unstaged != 1 || status.Untracked != 1 {
		t.Fatalf("dirty status = %+v", status)
	}
	if len(details.Files) != 2 || details.Files[1].Path != "new file\n中文.txt" {
		t.Fatalf("files = %+v", details.Files)
	}
	values := []string{}
	for _, entry := range details.Config {
		if entry.Key == "lal.multiline" {
			values = append(values, entry.Value)
		}
	}
	if strings.Join(values, "|") != "first\nsecond=value|another" || details.ConfigError != "" {
		t.Fatalf("local values = %q, error %q", values, details.ConfigError)
	}
	if statuses := app.GetGitStatuses(); len(statuses) != 1 || statuses[0].ServiceID != service.ID || statuses[0].State != "dirty" {
		t.Fatalf("batch status = %+v", statuses)
	}
	if _, err := app.GetServiceGitDetails("missing"); err == nil {
		t.Fatal("unknown service should fail")
	}
}

func TestGitProbeWorktreeSubdirectoryAndDetached(t *testing.T) {
	directory := testGitRepo(t)
	worktree := filepath.Join(t.TempDir(), "worktree")
	testGit(t, directory, "worktree", "add", "-b", "feature", worktree)
	info, err := os.Stat(filepath.Join(worktree, ".git"))
	if err != nil || info.IsDir() {
		t.Fatal("expected .git pointer file")
	}
	subdirectory := filepath.Join(worktree, "app")
	if err := os.Mkdir(subdirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	writeGitFile(t, worktree, "outside-project.txt", "change")
	testGit(t, directory, "config", "lal.shared", "common-config")
	// Ambient Git environment must not redirect inspection to another repo.
	t.Setenv("GIT_DIR", filepath.Join(directory, ".git"))
	status, _ := probeGit(context.Background(), Service{ID: "worktree", Directory: subdirectory})
	if status.State != "dirty" || status.Branch != "feature" || filepath.Base(status.Root) != "worktree" || status.Untracked != 1 {
		t.Fatalf("worktree = %+v", status)
	}
	app := &serviceManager{services: []Service{{ID: "worktree", Directory: subdirectory}}}
	details, err := app.GetServiceGitDetails("worktree")
	if err != nil || !strings.Contains(details.GitDir, "worktrees") {
		t.Fatalf("worktree metadata = %+v, %v", details, err)
	}
	found := false
	for _, entry := range details.Config {
		found = found || entry.Key == "lal.shared" && entry.Value == "common-config"
	}
	if !found {
		t.Fatal("local config should resolve the worktree's common repository")
	}
	testGit(t, worktree, "checkout", "--detach")
	status, _ = probeGit(context.Background(), Service{Directory: worktree})
	if !status.Detached || status.Commit == "" || status.Error != "" {
		t.Fatalf("detached = %+v", status)
	}
}

func TestGitProbeNoRepositoryUnbornAndInvalidPointer(t *testing.T) {
	directory := t.TempDir()
	status, _ := probeGit(context.Background(), Service{Directory: directory})
	if status.State != "not_repository" || status.Error != "" {
		t.Fatalf("no repository = %+v", status)
	}
	status, _ = probeGit(context.Background(), Service{Directory: filepath.Join(directory, "missing")})
	if status.State != "error" || status.Error == "" {
		t.Fatalf("missing directory = %+v", status)
	}
	writeGitFile(t, directory, ".git", "gitdir: /nonexistent/lal-git-test\n")
	status, _ = probeGit(context.Background(), Service{Directory: directory})
	if status.State != "error" {
		t.Fatalf("invalid pointer = %+v", status)
	}
	if err := os.Remove(filepath.Join(directory, ".git")); err != nil {
		t.Fatal(err)
	}
	testGit(t, directory, "init", "--initial-branch=main")
	status, _ = probeGit(context.Background(), Service{Directory: directory})
	if status.State != "clean" || !status.Unborn || status.Commit != "" {
		t.Fatalf("unborn = %+v", status)
	}
}

func TestGitProbeRenameConflictAndAheadBehind(t *testing.T) {
	directory := testGitRepo(t)
	testGit(t, directory, "mv", "tracked.txt", "renamed name.txt")
	status, files := probeGit(context.Background(), Service{Directory: directory})
	if status.Staged != 1 || len(files) != 1 || files[0].PreviousPath != "tracked.txt" || files[0].Path != "renamed name.txt" {
		t.Fatalf("rename: %+v, %+v", status, files)
	}
	testGit(t, directory, "commit", "-m", "Rename")
	testGit(t, directory, "branch", "other")
	writeGitFile(t, directory, "renamed name.txt", "main\n")
	testGit(t, directory, "commit", "-am", "Main change")
	testGit(t, directory, "checkout", "other")
	writeGitFile(t, directory, "renamed name.txt", "other\n")
	testGit(t, directory, "commit", "-am", "Other change")
	testGit(t, directory, "branch", "--set-upstream-to=main")
	cmd := exec.Command("git", "-C", directory, "merge", "main")
	cmd.Env = append(gitEnvironment(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null")
	if err := cmd.Run(); err == nil {
		t.Fatal("expected merge conflict")
	}
	status, files = probeGit(context.Background(), Service{Directory: directory})
	if status.Conflicts != 1 || len(files) != 1 || !files[0].Conflict || status.Ahead != 1 || status.Behind != 1 || status.Upstream != "main" {
		t.Fatalf("conflict: %+v, %+v", status, files)
	}
}

func TestGitProbeReadOnlyTruncationAndFailure(t *testing.T) {
	directory := testGitRepo(t)
	indexPath := filepath.Join(directory, ".git", "index")
	before, err := os.ReadFile(indexPath)
	if err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(indexPath)
	for index := 0; index < maxGitFiles+2; index++ {
		writeGitFile(t, directory, fmt.Sprintf("new-%03d.txt", index), "change")
	}
	app := &serviceManager{services: []Service{{ID: "large", Directory: directory}}}
	details, err := app.GetServiceGitDetails("large")
	if err != nil || !details.Truncated || len(details.Files) != maxGitFiles || details.Status.Changed != maxGitFiles+2 {
		t.Fatalf("large status = %+v, shown = %d, truncated = %v, %v", details.Status, len(details.Files), details.Truncated, err)
	}
	after, _ := os.ReadFile(indexPath)
	afterInfo, _ := os.Stat(indexPath)
	if !bytes.Equal(before, after) || !info.ModTime().Equal(afterInfo.ModTime()) {
		t.Fatal("inspection modified the Git index")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	status, _ := probeGit(ctx, Service{Directory: directory})
	if status.State != "error" || status.Error == "" {
		t.Fatalf("cancelled probe = %+v", status)
	}
	// An invalid index must not look like a clean repository. Config remains readable.
	if err := os.WriteFile(indexPath, []byte("invalid index"), 0o600); err != nil {
		t.Fatal(err)
	}
	details, err = app.GetServiceGitDetails("large")
	if err != nil || details.Status.State != "error" || details.Status.Error == "" || len(details.Config) == 0 {
		t.Fatalf("invalid index = %+v, %v", details, err)
	}
}
