package launcher

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoveredPromptsCannotReadOutsideProject(t *testing.T) {
	for _, kind := range []string{"file", "directory", "root"} {
		t.Run(kind, func(t *testing.T) {
			project, outside := t.TempDir(), t.TempDir()
			target := filepath.Join(outside, "private.md")
			if err := os.WriteFile(target, []byte("synthetic private content"), 0o600); err != nil {
				t.Fatal(err)
			}
			prompts := filepath.Join(project, "prompts")
			if kind != "root" {
				if err := os.Mkdir(prompts, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			link := filepath.Join(prompts, "linked.md")
			if kind == "directory" {
				target, link = outside, filepath.Join(prompts, "nested")
			} else if kind == "root" {
				target, link = outside, prompts
			}
			if err := os.Symlink(target, link); err != nil {
				t.Fatal(err)
			}
			app := testApp(t)
			app.services = []Service{{ID: "audit", Directory: project}}
			found, err := app.GetPrompts("audit")
			if err != nil || len(found) != 0 {
				t.Fatalf("linked prompt discovered: %#v, %v", found, err)
			}
			if _, err := app.readCodexPrompt("audit", link); err == nil {
				t.Fatal("unassociated linked prompt accepted for copy/open")
			}
		})
	}
}

func TestProjectPromptReadRechecksDirectoryBoundary(t *testing.T) {
	project := t.TempDir()
	path := filepath.Join(project, "prompts", "startup.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("safe"), 0o600); err != nil {
		t.Fatal(err)
	}
	service := Service{ID: "audit", Directory: project}
	paths, err := promptPaths(service)
	if err != nil || len(paths) != 1 {
		t.Fatalf("discover: %#v, %v", paths, err)
	}
	outside := filepath.Join(t.TempDir(), "private")
	if err := os.WriteFile(outside, []byte("synthetic private content"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, path); err != nil {
		t.Fatal(err)
	}
	if content, failure := readAssociatedPrompt(service, paths[0]); failure == "" || content != "" {
		t.Fatalf("read escaped project after discovery: %q, %q", content, failure)
	}
}
