package launcher

import (
	"path/filepath"
	"testing"
)

func TestFirstRunCreatesEmptyProjectList(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	state := newAppWithConfigPath(path).GetAppState()
	if state.Warning != "" || len(state.Services) != 0 || len(state.Workspaces) != 0 {
		t.Fatalf("first run must start empty: %#v", state)
	}
	restored := newAppWithConfigPath(path).GetAppState()
	if restored.Warning != "" || len(restored.Services) != 0 {
		t.Fatalf("empty first-run config did not persist: %#v", restored)
	}
}
