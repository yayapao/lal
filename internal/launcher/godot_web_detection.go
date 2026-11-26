package launcher

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type GodotWebView struct {
	Status    string `json:"status"`
	URL       string `json:"url"`
	EntryPath string `json:"entryPath"`
	Preset    string `json:"preset"`
	Available bool   `json:"available"`
	LastError string `json:"lastError"`
}

var godotPresetSection = regexp.MustCompile(`^\[preset\.[0-9]+\]$`)

// Read only Web export presets; never guess a directory containing source files.
func detectGodotWeb(directory string) GodotWebView {
	view := GodotWebView{Status: "stopped"}
	var presets []map[string]string
	var current map[string]string
	for _, line := range strings.Split(readDetectionText(filepath.Join(directory, "export_presets.cfg")), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "[") {
			current = nil
			if godotPresetSection.MatchString(line) {
				current = map[string]string{}
				presets = append(presets, current)
			}
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if current != nil && ok {
			value = strings.TrimSpace(value)
			if decoded, err := strconv.Unquote(value); err == nil {
				value = decoded
			}
			current[strings.TrimSpace(key)] = value
		}
	}
	var selected map[string]string
	for _, preset := range presets {
		if preset["platform"] == "Web" && (selected == nil || selected["runnable"] != "true" && preset["runnable"] == "true") {
			selected = preset
		}
	}
	if selected == nil {
		view.LastError = "请先在 Godot 中添加 Web 导出预设并导出游戏"
		return view
	}
	view.Preset = selected["name"]
	path := strings.TrimSpace(selected["export_path"])
	if path == "" || !strings.EqualFold(filepath.Ext(path), ".html") {
		view.LastError = "请在 Godot Web 预设中设置 HTML 导出路径"
		return view
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(directory, path)
	}
	view.EntryPath = filepath.Clean(path)
	view.Available = isFile(view.EntryPath)
	if !view.Available {
		view.LastError = fmt.Sprintf("尚未导出 Web 游戏，请先构建 [%s]：%s", view.Preset, view.EntryPath)
	}
	return view
}

func (m *serviceManager) godotWebViewLocked(service Service) *GodotWebView {
	if service.Module != moduleGame || !isFile(filepath.Join(service.Directory, "project.godot")) {
		return nil
	}
	view := detectGodotWeb(service.Directory)
	if session := m.godotWeb[service.ID]; session != nil {
		view.Status = session.view.Status
		view.URL = session.view.URL
		if session.view.LastError != "" {
			view.LastError = session.view.LastError
		}
	}
	return &view
}

func applyGodotWebExternal(view *ServiceView) {
	web, port := view.GodotWeb, view.Port
	// The configured preview URL may belong to a server started outside the
	// project directory. Opening it is allowed; it is never adopted or stopped.
	if web != nil && web.Status != "running" && port != nil && port.PreviewOnly && port.Accessible {
		web.Status, web.URL, web.LastError = "external", view.URL, ""
	}
}
