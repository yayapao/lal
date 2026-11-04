package launcher

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLogRedaction(t *testing.T) {
	for _, input := range []string{
		`OPENAI_API_KEY=audit-sensitive-value npm run dev`,
		`AWS_ACCESS_KEY_ID=audit-sensitive-value AWS_SECRET_ACCESS_KEY=audit-sensitive-value`,
		`--api-key audit-sensitive-value --port 3000`,
		`--password 'audit-sensitive-value with spaces'`,
		`{"client_secret":"audit-sensitive-value","status":200}`,
		`{"accessToken":"audit-sensitive-value","ok":true}`,
		`Authorization: Bearer audit-sensitive-value`,
		`Authorization: audit-sensitive-value`,
		`{"Authorization":"audit-sensitive-value","status":200}`,
		`{"Authorization":"Basic audit-sensitive-value"}`,
		`postgres://user:audit-sensitive-value@localhost:5432/db`,
		`GET /api?token=audit-sensitive-value&limit=10`,
		`Cookie: session=audit-sensitive-value; other=private`,
		`{"cookie":"session=audit-sensitive-value","status":200}`,
		syntheticPrivateKey("PRIVATE KEY", "audit-sensitive-value"),
	} {
		t.Run(input, func(t *testing.T) {
			got := redactLog(input)
			if strings.Contains(got, "audit-sensitive-value") || !strings.Contains(got, redactedValue) {
				t.Fatalf("credential not masked: %q", got)
			}
			if twice := redactLog(got); twice != got {
				t.Fatalf("redaction is not idempotent: %q -> %q", got, twice)
			}
			if strings.HasPrefix(input, "{") && !json.Valid([]byte(got)) {
				t.Fatalf("structured log damaged: %q", got)
			}
		})
	}
	for _, input := range []string{"GET /api 200 in 12ms", `{"service":"api","pid":123}`, "ECONNREFUSED localhost:3000"} {
		if got := redactLog(input); got != input {
			t.Fatalf("ordinary log changed: %q", got)
		}
	}
}

func TestLogsAreRedactedBeforeStorageEventsAndExport(t *testing.T) {
	app := testApp(t)
	events := []LogEntry{}
	app.emit = func(name string, payload any) {
		if name == "service:log" {
			events = append(events, payload.(LogEntry))
		}
	}
	app.captureOutput("audit", "stdout", strings.NewReader("password=audit-sensitive-value\n"+syntheticPrivateKey("RSA PRIVATE KEY", "audit-private-body")+"\nready\n"))
	for _, entries := range [][]LogEntry{app.GetLogs("audit"), events} {
		if len(entries) != 5 || entries[4].Text != "ready" {
			t.Fatalf("unexpected log sequence: %#v", entries)
		}
		for _, entry := range entries {
			if strings.Contains(entry.Text, "audit-") {
				t.Fatal("raw credential reached logs/event")
			}
		}
	}
	output := formatLogEntries([]LogEntry{{Stream: "stdout", Text: "password=audit-sensitive-value"}})
	if strings.Contains(output, "audit-sensitive-value") {
		t.Fatal("raw credential reached exported content")
	}
}

type logTestDesktop struct {
	Desktop
	path string
}

func (d logTestDesktop) SaveLogFile(string) (string, error) { return d.path, nil }

func TestDownloadLogsUsesPrivateReplacement(t *testing.T) {
	app := testApp(t)
	app.services = []Service{{ID: "audit", Name: "Audit"}}
	app.appendLog("audit", "stdout", "password=audit-sensitive-value")
	path := filepath.Join(t.TempDir(), "existing.log")
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	// Replacing a hard link must not overwrite its original target.
	original := path + ".original"
	if err := os.Link(path, original); err != nil {
		t.Fatal(err)
	}
	app.desktop = logTestDesktop{path: path}
	if _, err := app.DownloadLogs("audit"); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("export permissions: %v, %v", info, err)
	}
	data, err := os.ReadFile(original)
	if err != nil || string(data) != "old" {
		t.Fatal("export modified the hard link target")
	}
	link := filepath.Join(t.TempDir(), "linked.log")
	if err := os.Symlink(original, link); err != nil {
		t.Fatal(err)
	}
	app.desktop = logTestDesktop{path: link}
	if _, err := app.DownloadLogs("audit"); err == nil {
		t.Fatal("export followed a symlink")
	}
	remaining, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".lal-log-*"))
	if err != nil || len(remaining) != 0 {
		t.Fatal("export left a temporary file behind")
	}
}

func syntheticPrivateKey(kind, body string) string {
	return fmt.Sprintf("-----BEGIN %s-----\n%s\n-----END %s-----", kind, body, kind)
}
