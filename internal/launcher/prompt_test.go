package launcher

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestPromptsDiscoverProjectFilesAndManageAddedFiles(t *testing.T) {
	projectDir := t.TempDir()
	projectPrompt := filepath.Join(projectDir, defaultPromptsDir, "startup.md")
	nestedPrompt := filepath.Join(projectDir, defaultPromptsDir, "team", "review.md")
	uppercasePrompt := filepath.Join(projectDir, defaultPromptsDir, "release.MD")
	if err := os.MkdirAll(filepath.Dir(nestedPrompt), 0o755); err != nil {
		t.Fatalf("create prompt directory: %v", err)
	}
	projectFiles := map[string]string{
		projectPrompt:   "project prompt\n",
		nestedPrompt:    "nested prompt\n",
		uppercasePrompt: "release prompt\n",
		filepath.Join(projectDir, defaultPromptsDir, "ignored.txt"):      "not markdown\n",
		filepath.Join(projectDir, defaultPromptsDir, "ignored.markdown"): "not md\n",
	}
	for path, content := range projectFiles {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatalf("write project file %s: %v", path, err)
		}
	}
	app := newAppWithConfigPath(emptyConfig(t))
	service, err := app.CreateService(ServiceInput{
		Name:      "Prompted",
		Directory: projectDir,
		Command:   "npm run dev",
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	prompts, err := app.GetPrompts(service.ID)
	if err != nil {
		t.Fatalf("get prompts: %v", err)
	}
	gotDisplayPaths := make([]string, 0, len(prompts))
	for _, prompt := range prompts {
		gotDisplayPaths = append(gotDisplayPaths, prompt.DisplayPath)
	}
	wantDisplayPaths := []string{"prompts/release.MD", "prompts/startup.md", "prompts/team/review.md"}
	if !reflect.DeepEqual(gotDisplayPaths, wantDisplayPaths) {
		t.Fatalf("unexpected discovered prompts: %#v, %v", prompts, err)
	}
	if prompts[1].Path != projectPrompt || prompts[1].Content != "project prompt\n" || prompts[1].Source != "project" {
		t.Fatalf("unexpected project prompt: %#v", prompts[1])
	}
	prompt, err := app.readCodexPrompt(service.ID, projectPrompt)
	if err != nil || prompt != "project prompt\n" {
		t.Fatalf("read project prompt = %q, %v", prompt, err)
	}
	if err := os.WriteFile(projectPrompt, []byte("updated project prompt\n"), 0o600); err != nil {
		t.Fatalf("update project prompt: %v", err)
	}
	prompt, err = app.readCodexPrompt(service.ID, projectPrompt)
	if err != nil || prompt != "updated project prompt\n" {
		t.Fatalf("read updated project prompt = %q, %v", prompt, err)
	}

	addedPrompt := filepath.Join(t.TempDir(), "shared.md")
	if err := os.WriteFile(addedPrompt, []byte("shared prompt"), 0o600); err != nil {
		t.Fatalf("write added prompt: %v", err)
	}
	if err := app.AddPromptFile(service.ID, addedPrompt); err != nil {
		t.Fatalf("add prompt: %v", err)
	}
	prompts, err = app.GetPrompts(service.ID)
	if err != nil || len(prompts) != 4 || prompts[3].Path != addedPrompt || prompts[3].Source != "added" {
		t.Fatalf("unexpected prompts after add: %#v, %v", prompts, err)
	}
	if err := app.RemovePromptFile(service.ID, addedPrompt); err != nil {
		t.Fatalf("remove prompt association: %v", err)
	}
	if _, err := os.Stat(addedPrompt); err != nil {
		t.Fatalf("removing association deleted source file: %v", err)
	}
	if prompts, err = newAppWithConfigPath(app.configPath).GetPrompts(service.ID); err != nil || len(prompts) != 3 {
		t.Fatalf("prompt association was not removed: %#v, %v", prompts, err)
	}
	if err := app.RemovePromptFile(service.ID, projectPrompt); err == nil {
		t.Fatal("expected project prompt removal to fail")
	}
}

func TestLegacySinglePromptPathMigratesToAddedPrompt(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "config.json")
	projectDir := t.TempDir()
	legacy := configFile{Version: 4, Services: []Service{{
		ID: "legacy", Name: "Legacy", Directory: projectDir, Command: "npm run dev", CleanCommand: defaultCleanCommand, PromptFile: "docs/session.md",
	}}}
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatalf("marshal legacy config: %v", err)
	}
	if err := os.WriteFile(configPath, data, 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	service := newAppWithConfigPath(configPath).GetAppState().Services[0]
	if service.PromptFile != "" || len(service.PromptFiles) != 1 || service.PromptFiles[0] != "docs/session.md" {
		t.Fatalf("legacy prompt was not migrated: %#v", service)
	}
}

func TestCodexAppArgumentsPreserveDirectory(t *testing.T) {
	workspace := "/tmp/My Project"
	want := []string{"app", workspace}
	if got := codexAppArguments(workspace); !reflect.DeepEqual(got, want) {
		t.Fatalf("Codex arguments = %#v, want %#v", got, want)
	}
}

func TestCodexPasteReplacesTheOpenedConversationDraft(t *testing.T) {
	selectAll := strings.Index(codexNewConversationAndPasteScript, `keystroke "a" using command down`)
	paste := strings.Index(codexNewConversationAndPasteScript, `keystroke "v" using command down`)
	if selectAll < 0 || paste < 0 || selectAll >= paste {
		t.Fatalf("expected draft selection before paste:\n%s", codexNewConversationAndPasteScript)
	}
	if strings.Contains(codexNewConversationAndPasteScript, `keystroke "n" using command down`) {
		t.Fatalf("Codex app command already opens a new conversation:\n%s", codexNewConversationAndPasteScript)
	}
}
