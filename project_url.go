package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	simpleScriptName = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_:.-]*$`)
	portFlag         = regexp.MustCompile(`(?:^|\s)(?:--port|-p)(?:=|\s+)["']?([0-9]{1,5})(?:["']?(?:\s|$))`)
	portOption       = regexp.MustCompile(`(?:^|\s)(?:--port|-p)(?:=|\s|$)`)
	portAssignment   = regexp.MustCompile(`(?:^|\s)PORT=["']?([0-9]{1,5})(?:["']?(?:\s|$))`)
	listenPort       = regexp.MustCompile(`(?:^|\s)(?:--listen|-l)(?:=|\s+)["']?(?:[A-Za-z0-9_.-]+:)?([0-9]{1,5})(?:["']?(?:\s|$))`)
	httpServerPort   = regexp.MustCompile(`(?:^|\s)python(?:3(?:\.\d+)?)?\s+-m\s+http\.server(?:\s+(?:--port\s+)?)([0-9]{1,5})(?:\s|$)`)
	hostFlag         = regexp.MustCompile(`(?:^|\s)--(?:host|hostname|bind)(?:=|\s+)["']?([A-Za-z0-9_.-]+)`)
	scriptReference  = regexp.MustCompile(`(?:npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9_:.-]+)`)
	nodeEntry        = regexp.MustCompile(`(?:^|\s)(?:node|tsx|ts-node)\s+(?:--[\w-]+(?:=[^\s]+)?\s+)*["']?([\w./-]+\.(?:js|mjs|cjs|ts))`)
	serverListenPort = regexp.MustCompile(`(?:\.listen\s*\(|\bport\s*[:=]\s*)(?:process\.env\.PORT\s*(?:\|\||\?\?)\s*)?["']?([0-9]{1,5})\b`)
	portFallback     = regexp.MustCompile(`process\.env\.PORT\s*(?:\|\||\?\?)\s*["']?([0-9]{1,5})\b`)
	viteServer       = regexp.MustCompile(`(?s)\bserver\s*:\s*\{([^}]+)\}`)
	vitePort         = regexp.MustCompile(`\bport\s*:\s*([0-9]{1,5})\b`)
	nextLaunch       = regexp.MustCompile(`(?:^|\s)next\s+(?:dev|start)(?:\s|$)`)
	viteLaunch       = regexp.MustCompile(`(?:^|\s)vite(?:\s|$)`)
	previewLaunch    = regexp.MustCompile(`(?:^|\s)vite\s+preview(?:\s|$)`)
)

func detectProjectURL(directory, command string, scripts []PackageScript, sources *[]string) string {
	command = resolveProjectScript(command, scripts, 0)
	port := matchedPort(portFlag, command)
	if port == 0 {
		port = matchedPort(portAssignment, command)
	}
	if port == 0 {
		port = matchedPort(listenPort, command)
	}
	if port == 0 {
		port = matchedPort(httpServerPort, command)
	}
	if port == 0 && portOption.MatchString(command) {
		return ""
	}
	if port == 0 && viteLaunch.MatchString(command) && !previewLaunch.MatchString(command) {
		var configured bool
		port, configured = detectVitePort(directory, sources)
		if configured && port == 0 {
			return ""
		}
	}
	if port == 0 {
		if match := nodeEntry.FindStringSubmatch(command); match != nil {
			filename := filepath.Clean(match[1])
			path := filepath.Join(directory, filename)
			if pathWithin(directory, path) {
				if text := readDetectionText(path); text != "" {
					port = matchedPort(portFallback, text)
					if port == 0 {
						port = matchedPort(serverListenPort, text)
					}
					if port != 0 {
						addDetectionSource(sources, filename)
					}
				}
			}
		}
	}
	if port == 0 {
		switch {
		case nextLaunch.MatchString(command), strings.Contains(command, "react-scripts start"):
			port = 3000
		case previewLaunch.MatchString(command):
			port = 4173
		case viteLaunch.MatchString(command):
			port = 5173
		case strings.Contains(command, "ng serve"):
			port = 4200
		}
	}
	if port == 0 {
		return ""
	}
	host, scheme := "localhost", "http"
	if match := hostFlag.FindStringSubmatch(command); match != nil && match[1] != "0.0.0.0" {
		host = match[1]
	}
	if strings.Contains(command, "--https") || strings.Contains(command, "--experimental-https") {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s:%d", scheme, host, port)
}

func resolveProjectScript(command string, scripts []PackageScript, depth int) string {
	if depth >= 5 {
		return command
	}
	match := scriptReference.FindStringSubmatch(command)
	if match == nil {
		return command
	}
	for _, script := range scripts {
		if script.Name == match[1] {
			return command + " " + resolveProjectScript(script.Command, scripts, depth+1)
		}
	}
	return command
}

func detectVitePort(directory string, sources *[]string) (int, bool) {
	for _, filename := range []string{"vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"} {
		text := readDetectionText(filepath.Join(directory, filename))
		match := viteServer.FindStringSubmatch(text)
		if match == nil || !strings.Contains(match[1], "port") {
			continue
		}
		addDetectionSource(sources, filename)
		return matchedPort(vitePort, match[1]), true
	}
	return 0, false
}

func matchedPort(pattern *regexp.Regexp, text string) int {
	match := pattern.FindStringSubmatch(text)
	if match == nil {
		return 0
	}
	port, _ := strconv.Atoi(match[1])
	if port < 1 || port > 65535 {
		return 0
	}
	return port
}

func readDetectionText(path string) string {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 256*1024 {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}
