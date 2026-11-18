package launcher

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type repairTestDesktop struct {
	Desktop
	path   string
	copied string
	err    error
}

func (d *repairTestDesktop) CopyText(value string) error           { d.copied = value; return d.err }
func (d *repairTestDesktop) SavePromptFile(string) (string, error) { return d.path, d.err }

func TestRepairPromptCopyAndExport(t *testing.T) {
	app := testApp(t)
	app.services = []Service{{ID: "game", Name: "Game"}}
	desktop := &repairTestDesktop{path: filepath.Join(t.TempDir(), "repair.md")}
	app.desktop = desktop
	prompt := "请修复构建\npassword=synthetic-sensitive-value\nERROR: missing import"
	if err := app.CopyRepairPrompt(prompt); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(desktop.copied, "synthetic-sensitive-value") || !strings.Contains(desktop.copied, "ERROR: missing import") {
		t.Fatal("copy lost the diagnostic or leaked a credential")
	}
	path, err := app.DownloadRepairPrompt("game", prompt)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != desktop.copied {
		t.Fatalf("export differs from copy: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("export permissions: %v, %v", info, err)
	}
	if err := app.CopyRepairPrompt(""); err == nil {
		t.Fatal("accepted empty prompt")
	}
	if _, err := app.DownloadRepairPrompt("missing", prompt); err == nil {
		t.Fatal("accepted unknown project")
	}
	if err := app.CopyRepairPrompt(strings.Repeat("x", 1024*1024+1)); err == nil {
		t.Fatal("accepted oversized prompt")
	}
	desktop.path = ""
	if path, err := app.DownloadRepairPrompt("game", prompt); err != nil || path != "" {
		t.Fatalf("cancel: %q, %v", path, err)
	}
	desktop.err = errors.New("clipboard unavailable")
	if err := app.CopyRepairPrompt(prompt); err == nil {
		t.Fatal("hid clipboard error")
	}
}
