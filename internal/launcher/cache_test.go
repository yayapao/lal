package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestClearNextCacheRemovesDirectoryAndRestartsRunningService(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	cacheDir := filepath.Join(projectDir, ".next")
	if err := os.MkdirAll(filepath.Join(cacheDir, "cache"), 0o755); err != nil {
		t.Fatalf("create cache: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cacheDir, "cache", "stale"), []byte("stale"), 0o600); err != nil {
		t.Fatalf("write cache: %v", err)
	}
	service, err := app.CreateService(ServiceInput{
		Name:      "Next app",
		Directory: projectDir,
		Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.StartService(service.ID); err != nil {
		t.Fatalf("start service: %v", err)
	}
	firstPID := serviceState(t, app, service.ID).PID

	if err := app.ClearNextCache(service.ID); err != nil {
		t.Fatalf("clear Next.js cache: %v", err)
	}
	if _, err := os.Stat(cacheDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf(".next still exists after cleanup: %v", err)
	}
	waitFor(t, time.Second, func() bool {
		state := serviceState(t, app, service.ID)
		return state.Status == "running" && state.PID != 0 && state.PID != firstPID
	})
}

func TestClearNextCacheWorksForStoppedService(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(projectDir, ".next"), 0o755); err != nil {
		t.Fatalf("create cache: %v", err)
	}
	service, err := app.CreateService(ServiceInput{Name: "Stopped Next", Directory: projectDir, Command: "exit 0"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.ClearNextCache(service.ID); err != nil {
		t.Fatalf("clear Next.js cache: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectDir, ".next")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf(".next still exists after cleanup: %v", err)
	}
	if state := serviceState(t, app, service.ID); state.Status != "stopped" {
		t.Fatalf("stopped service changed state: %#v", state)
	}
}

func TestClearNextCacheRunsCustomCommandInProjectDirectory(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	for _, directory := range []string{".next", "build/cache", "keep"} {
		if err := os.MkdirAll(filepath.Join(projectDir, directory), 0o755); err != nil {
			t.Fatalf("create %s: %v", directory, err)
		}
	}
	service, err := app.CreateService(ServiceInput{
		Name:         "Custom cache",
		Directory:    projectDir,
		Command:      "exit 0",
		CleanCommand: "rm -rf .next build/cache",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if err := app.ClearNextCache(service.ID); err != nil {
		t.Fatalf("clear custom cache: %v", err)
	}
	for _, directory := range []string{".next", "build/cache"} {
		if _, err := os.Stat(filepath.Join(projectDir, directory)); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("custom cache %s still exists: %v", directory, err)
		}
	}
	if _, err := os.Stat(filepath.Join(projectDir, "keep")); err != nil {
		t.Fatalf("unlisted directory was removed: %v", err)
	}
}
