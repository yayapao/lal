package main

import (
	"encoding/json"
	"net/url"
	"path/filepath"
	"strings"
)

const lalManifestFilename = ".lal.json"

type lalProjectManifest struct {
	URL string `json:"url"`
}

// detectManifestURL reads an optional project-owned URL declaration. This file
// is metadata only: LAL never imports or executes it.
func detectManifestURL(directory string) (string, bool, string) {
	text := readDetectionText(filepath.Join(directory, lalManifestFilename))
	if text == "" {
		return "", false, ""
	}
	var manifest lalProjectManifest
	if err := json.Unmarshal([]byte(text), &manifest); err != nil {
		return "", true, ".lal.json 无法解析，已忽略其中的访问地址。"
	}
	value := normalizeAccessURL(manifest.URL)
	if value == "" {
		return "", true, ""
	}
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return "", true, ".lal.json 中的 url 必须是有效的 http 或 https 地址。"
	}
	return value, true, ""
}

func appendManifestNotice(result *ProjectDetection, found bool, warning string) {
	if !found {
		return
	}
	addDetectionSource(&result.Sources, lalManifestFilename)
	if strings.TrimSpace(warning) != "" {
		result.Warnings = append(result.Warnings, warning)
	}
}
