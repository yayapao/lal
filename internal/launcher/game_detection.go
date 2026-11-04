package launcher

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var godotProjectName = regexp.MustCompile(`(?m)^config/name\s*=\s*("(?:\\.|[^"])*")`)

func detectStandaloneGameProject(directory string) (ProjectDetection, bool) {
	if isFile(filepath.Join(directory, "project.godot")) {
		return ProjectDetection{
			Directory:    directory,
			Name:         godotProjectNameFrom(directory),
			ProjectType:  "godot",
			Command:      godotLaunchCommand(),
			CleanCommand: "rm -rf .godot",
			Scripts:      []ProjectScript{}, Sources: []string{"project.godot"}, Warnings: []string{},
		}, true
	}
	if isFile(filepath.Join(directory, "ProjectSettings", "ProjectVersion.txt")) {
		return ProjectDetection{
			Directory:    directory,
			Name:         filepath.Base(directory),
			ProjectType:  "unity",
			Command:      "open -a Unity -n .",
			CleanCommand: "rm -rf Library",
			Scripts:      []ProjectScript{}, Sources: []string{"ProjectSettings/ProjectVersion.txt"}, Warnings: []string{},
		}, true
	}
	return ProjectDetection{}, false
}

func godotProjectNameFrom(directory string) string {
	text := readDetectionText(filepath.Join(directory, "project.godot"))
	match := godotProjectName.FindStringSubmatch(text)
	if match == nil {
		return filepath.Base(directory)
	}
	if name, err := strconv.Unquote(match[1]); err == nil && strings.TrimSpace(name) != "" {
		return strings.TrimSpace(name)
	}
	return filepath.Base(directory)
}

func godotLaunchCommand() string {
	const appBinary = "/Applications/Godot.app/Contents/MacOS/Godot"
	if isFile(appBinary) {
		return shellQuote(appBinary) + " --path ."
	}
	return "godot --path ."
}
