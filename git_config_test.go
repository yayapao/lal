package main

import (
	"bytes"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func gitConfigTestManager(t *testing.T, directory string) (*serviceManager, GitConfigEdit) {
	t.Helper()
	manager := &serviceManager{services: []Service{{ID: "repo", Directory: directory}}}
	details, err := manager.GetServiceGitDetails("repo")
	if err != nil || details.ConfigError != "" || details.Status.Root == "" {
		t.Fatalf("config details: %+v, %v", details, err)
	}
	return manager, GitConfigEdit{Directory: directory, Root: details.Status.Root}
}

func gitConfigValues(t *testing.T, manager *serviceManager, key string) []string {
	t.Helper()
	details, err := manager.GetServiceGitDetails("repo")
	if err != nil || details.ConfigError != "" {
		t.Fatalf("read config: %s, %v", details.ConfigError, err)
	}
	values := []string{}
	for _, entry := range details.Config {
		if entry.Key == key {
			values = append(values, entry.Value)
		}
	}
	return values
}

func TestGitConfigEditAddReplaceDeleteAndDuplicates(t *testing.T) {
	directory := testGitRepo(t)
	configPath := filepath.Join(directory, ".git", "config")
	file, err := os.OpenFile(configPath, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	file.WriteString("\n# keep this comment\n[lal]\n\tuntouched = keep\n")
	file.Close()
	if err := os.Chmod(configPath, 0o640); err != nil {
		t.Fatal(err)
	}
	manager, input := gitConfigTestManager(t, directory)
	input.Key, input.ExpectedValues, input.Values = "USER.email", []string{"lal@example.test"}, []string{"new@example.test"}
	if err := manager.UpdateGitConfig("repo", input); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(gitConfigValues(t, manager, "user.email"), input.Values) {
		t.Fatal("email did not change")
	}
	input.Key, input.ExpectedValues = "lal.multiple", nil
	input.Values = []string{"same", "same", "literal $(touch never); --global\nsecond=line", ""}
	if err := manager.UpdateGitConfig("repo", input); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(gitConfigValues(t, manager, input.Key), input.Values) {
		t.Fatal("duplicate, multiline, and empty values must be preserved")
	}
	input.ExpectedValues = slices.Clone(input.Values)
	input.Values = []string{"same", "edited", input.Values[2], ""}
	if err := manager.UpdateGitConfig("repo", input); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(gitConfigValues(t, manager, input.Key), input.Values) {
		t.Fatal("editing one duplicate lost another value")
	}
	input.ExpectedValues, input.Values = slices.Clone(input.Values), nil
	if err := manager.UpdateGitConfig("repo", input); err != nil {
		t.Fatal(err)
	}
	if len(gitConfigValues(t, manager, input.Key)) != 0 {
		t.Fatal("key was not removed")
	}
	content, _ := os.ReadFile(configPath)
	info, _ := os.Stat(configPath)
	if !bytes.Contains(content, []byte("# keep this comment")) || info.Mode().Perm() != 0o640 || testGit(t, directory, "config", "--local", "--get", "lal.untouched") != "keep" {
		t.Fatal("unrelated config, comments, or permissions changed")
	}
}

func TestGitConfigEditConflictsAndLockDoNotChangeConfig(t *testing.T) {
	directory := testGitRepo(t)
	manager, input := gitConfigTestManager(t, directory)
	input.Key, input.ExpectedValues, input.Values = "user.name", []string{"LAL Test"}, []string{"new name"}
	configPath := filepath.Join(directory, ".git", "config")
	testGit(t, directory, "config", "--local", "user.name", "external edit")
	before, _ := os.ReadFile(configPath)
	if err := manager.UpdateGitConfig("repo", input); err == nil || !strings.Contains(err.Error(), "已被其他程序修改") {
		t.Fatalf("expected conflict: %v", err)
	}
	after, _ := os.ReadFile(configPath)
	if !bytes.Equal(before, after) {
		t.Fatal("conflict overwrote external config")
	}
	lockPath := configPath + ".lock"
	writeGitFile(t, filepath.Dir(configPath), "config.lock", "another writer")
	input.ExpectedValues = []string{"external edit"}
	if err := manager.UpdateGitConfig("repo", input); err == nil {
		t.Fatal("must respect existing config lock")
	}
	lock, _ := os.ReadFile(lockPath)
	if string(lock) != "another writer" {
		t.Fatal("modified another writer's lock")
	}
	if err := os.Remove(lockPath); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"--global", "user", "user.bad key", "user.name\ncore.bare", "user.1bad"} {
		input.Key = key
		if err := manager.UpdateGitConfig("repo", input); err == nil {
			t.Fatalf("accepted invalid key %q", key)
		}
	}
	input.Key, input.Values = "user.name", []string{"bad\x00value"}
	if err := manager.UpdateGitConfig("repo", input); err == nil {
		t.Fatal("accepted NUL value")
	}
	input.Values, input.Directory = []string{"name"}, filepath.Join(directory, "other")
	if err := manager.UpdateGitConfig("repo", input); err == nil {
		t.Fatal("accepted stale project directory")
	}
	after, _ = os.ReadFile(configPath)
	if !bytes.Equal(before, after) {
		t.Fatal("rejected edit changed config")
	}
	leftovers, _ := filepath.Glob(filepath.Join(filepath.Dir(configPath), ".lal-git-config-*"))
	if len(leftovers) > 0 {
		t.Fatalf("temporary files remain: %v", leftovers)
	}
}

func TestGitConfigEditFromWorktreePreservesSubsectionCase(t *testing.T) {
	directory := testGitRepo(t)
	worktree := filepath.Join(t.TempDir(), "worktree")
	testGit(t, directory, "worktree", "add", "-b", "config-test", worktree)
	manager, input := gitConfigTestManager(t, worktree)
	input.Key, input.Values = "Remote.MyRemote.URL", []string{"-literal-value"}
	if err := manager.UpdateGitConfig("repo", input); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(gitConfigValues(t, manager, "remote.MyRemote.url"), input.Values) {
		t.Fatal("subsection case was not preserved")
	}
	if testGit(t, directory, "config", "--local", "--get", "remote.MyRemote.url") != "-literal-value" {
		t.Fatal("worktree did not update common local config")
	}
}
