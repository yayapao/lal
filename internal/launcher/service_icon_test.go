package launcher

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestServiceIconVersionTracksFileChanges(t *testing.T) {
	app := testApp(t)
	projectDir := t.TempDir()
	logoPath := filepath.Join(projectDir, "public", "logo.png")
	if err := os.MkdirAll(filepath.Dir(logoPath), 0o755); err != nil {
		t.Fatalf("create public directory: %v", err)
	}
	writeLogo := func(data string, modified time.Time) {
		t.Helper()
		if err := os.WriteFile(logoPath, []byte(data), 0o600); err != nil {
			t.Fatalf("write logo: %v", err)
		}
		if err := os.Chtimes(logoPath, modified, modified); err != nil {
			t.Fatalf("set logo modification time: %v", err)
		}
	}
	modified := time.Unix(1700000000, 0)
	writeLogo("old", modified)
	service, err := app.CreateService(ServiceInput{Name: "Logo app", Directory: projectDir, Command: "exit 0"})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	if service.IconVersion == "" {
		t.Fatal("expected a file version for the project logo")
	}
	if unchanged := app.GetAppState().Services[0]; unchanged.IconVersion != service.IconVersion {
		t.Fatal("unchanged logo should retain its version")
	}

	modified = modified.Add(time.Second)
	writeLogo("new", modified)
	updated := app.GetAppState().Services[0]
	if updated.IconPath != service.IconPath || updated.IconVersion == service.IconVersion {
		t.Fatal("replacing a same-size logo should change its version without changing its path")
	}
	iconURL, err := app.GetServiceIcon(service.ID)
	if err != nil || iconURL != "data:image/png;base64,"+base64.StdEncoding.EncodeToString([]byte("new")) {
		t.Fatalf("expected updated logo bytes, got %q, error: %v", iconURL, err)
	}
}
