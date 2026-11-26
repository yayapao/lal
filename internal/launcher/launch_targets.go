package launcher

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// LaunchTarget is a process in the same project, not a second project record.
type LaunchTarget struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Command string `json:"command"`
	URL     string `json:"url,omitempty"`
	Default bool   `json:"default"`
}

var targetIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func normalizeLaunchTargets(targets []LaunchTarget) []LaunchTarget {
	result := append([]LaunchTarget(nil), targets...)
	for i := range result {
		t := &result[i]
		t.ID, t.Name, t.Command = strings.TrimSpace(t.ID), strings.TrimSpace(t.Name), strings.TrimSpace(t.Command)
		t.URL = normalizeAccessURL(t.URL)
	}
	return result
}

func validateLaunchTargets(service Service) error {
	if strings.Contains(service.ID, "::") {
		return fmt.Errorf("项目 ID 不能包含 ::")
	}
	if len(service.LaunchTargets) > 16 {
		return fmt.Errorf("每个项目最多配置 16 个进程")
	}
	if len(service.LaunchTargets) > 0 && service.Module == moduleGame {
		return fmt.Errorf("游戏项目不支持多进程配置")
	}
	seen := map[string]bool{}
	for _, t := range service.LaunchTargets {
		if !targetIDPattern.MatchString(t.ID) || seen[t.ID] {
			return fmt.Errorf("进程 ID 必须唯一，且仅含字母、数字、下划线或连字符（最多 64 位）")
		}
		seen[t.ID] = true
		child := targetService(service, t)
		// Validate as a standalone process, avoiding the reserved runtime ID separator.
		child.ID = t.ID
		if err := validateService(child); err != nil {
			return fmt.Errorf("进程 %q：%w", t.Name, err)
		}
	}
	return nil
}

func targetService(parent Service, target LaunchTarget) Service {
	return Service{ID: parent.ID + "::" + target.ID, Name: target.Name, Module: moduleService,
		Workspace: parent.Workspace, Directory: parent.Directory, Command: target.Command, URL: target.URL, CleanCommand: parent.CleanCommand}
}

func runtimeIDs(service Service) []string {
	if len(service.LaunchTargets) == 0 {
		return []string{service.ID}
	}
	ids := make([]string, 0, len(service.LaunchTargets))
	for _, target := range service.LaunchTargets {
		ids = append(ids, targetService(service, target).ID)
	}
	return ids
}

func parentID(id string) string { return strings.SplitN(id, "::", 2)[0] }

func (m *serviceManager) targetByIDLocked(id string) (Service, bool) {
	parts := strings.SplitN(id, "::", 2)
	if len(parts) != 2 {
		return Service{}, false
	}
	index := m.serviceIndexLocked(parts[0])
	if index < 0 {
		return Service{}, false
	}
	parent := m.services[index]
	for _, target := range parent.LaunchTargets {
		if target.ID == parts[1] {
			return targetService(parent, target), true
		}
	}
	return Service{}, false
}

func (m *serviceManager) serviceBusyLocked(id string) bool {
	if session := m.godotWeb[id]; session != nil && session.server != nil {
		return true
	}
	if m.targetBusy[parentID(id)] {
		return true
	}
	service, ok := m.serviceByIDLocked(id)
	if !ok {
		return false
	}
	for _, key := range runtimeIDs(service) {
		if m.processes[key] != nil || m.lastStatus[key] == "starting" {
			return true
		}
	}
	return false
}

func applyDetectedTargets(result *ProjectDetection) {
	var manifest lalProjectManifest
	if json.Unmarshal([]byte(readDetectionText(filepath.Join(result.Directory, lalManifestFilename))), &manifest) != nil {
		return
	}
	targets := normalizeLaunchTargets(manifest.LaunchTargets)
	candidate := Service{ID: "detection", Directory: result.Directory, Module: moduleService, LaunchTargets: targets}
	if err := validateLaunchTargets(candidate); err != nil {
		result.Warnings = append(result.Warnings, ".lal.json 进程配置无效："+err.Error())
		return
	}
	result.LaunchTargets = targets
	if len(targets) > 0 && strings.TrimSpace(manifest.CleanCommand) != "" && len(manifest.CleanCommand) <= maxCleanCommandLength {
		result.CleanCommand = strings.TrimSpace(manifest.CleanCommand)
	}
}
