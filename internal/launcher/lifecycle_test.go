package launcher

import (
	"path/filepath"
	"testing"
)

func TestQuitTracksManagedServicesAndScripts(t *testing.T) {
	a := newAppWithConfigPath(filepath.Join(t.TempDir(), "config.json"))
	if HasRunningProcesses(a) {
		t.Fatal("empty session has no managed processes")
	}
	a.scriptProcesses["task"] = &processState{}
	if !HasRunningProcesses(a) {
		t.Fatal("a running package task must require confirmation")
	}
	delete(a.scriptProcesses, "task")
	a.processes["service"] = &processState{}
	if !HasRunningProcesses(a) {
		t.Fatal("a running service must require confirmation")
	}
}

func TestConfigPathOverride(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	t.Setenv("LAL_CONFIG_PATH", path)
	if defaultConfigPath() != path {
		t.Fatal("absolute config path override was ignored")
	}
	t.Setenv("LAL_CONFIG_PATH", "relative.json")
	if defaultConfigPath() == "relative.json" {
		t.Fatal("relative config paths must not depend on the launch directory")
	}
}
