package main

import (
	"fmt"
	"strconv"
	"strings"
)

func parseGitStatus(output []byte, status *GitStatus) ([]GitChange, error) {
	files := []GitChange{}
	records := strings.Split(string(output), "\x00")
	for index := 0; index < len(records); index++ {
		record := records[index]
		if record == "" {
			continue
		}
		if strings.HasPrefix(record, "# ") {
			key, value, _ := strings.Cut(record[2:], " ")
			switch key {
			case "branch.head":
				status.Detached = value == "(detached)"
				status.Branch = value
			case "branch.oid":
				status.Unborn = value == "(initial)"
				if !status.Unborn {
					status.Commit = value
				}
			case "branch.upstream":
				status.Upstream = value
			case "branch.ab":
				parts := strings.Fields(value)
				if len(parts) == 2 {
					status.Ahead, _ = strconv.Atoi(strings.TrimPrefix(parts[0], "+"))
					status.Behind, _ = strconv.Atoi(strings.TrimPrefix(parts[1], "-"))
				}
			}
			continue
		}
		change := GitChange{}
		switch record[0] {
		case '?':
			if !strings.HasPrefix(record, "? ") {
				return nil, fmt.Errorf("无法解析 Git 未跟踪文件")
			}
			change.Path, change.Untracked = record[2:], true
			status.Untracked++
		case '1', '2', 'u':
			fieldCount := map[byte]int{'1': 9, '2': 10, 'u': 11}[record[0]]
			parts := strings.SplitN(record, " ", fieldCount)
			if len(parts) != fieldCount || len(parts[1]) != 2 {
				return nil, fmt.Errorf("无法解析 Git 文件状态")
			}
			change.Path = parts[fieldCount-1]
			change.IndexStatus, change.WorktreeStatus = parts[1][:1], parts[1][1:]
			change.Conflict = record[0] == 'u'
			if change.Conflict {
				status.Conflicts++
			} else {
				if change.IndexStatus != "." {
					status.Staged++
				}
				if change.WorktreeStatus != "." {
					status.Unstaged++
				}
			}
			if record[0] == '2' {
				index++
				if index >= len(records) || records[index] == "" {
					return nil, fmt.Errorf("无法解析 Git 重命名路径")
				}
				change.PreviousPath = records[index]
			}
		default:
			return nil, fmt.Errorf("无法识别 Git 文件状态")
		}
		status.Changed++
		if len(files) < maxGitFiles {
			files = append(files, change)
		}
	}
	if status.Branch == "" {
		return nil, fmt.Errorf("Git 未返回分支状态")
	}
	return files, nil
}

// With --null, Git separates the key and value with the first newline.
// Keep duplicates, empty values, and all subsequent newlines in the value.
func parseGitConfig(output []byte) []GitConfigEntry {
	entries := []GitConfigEntry{}
	for _, record := range strings.Split(string(output), "\x00") {
		if record == "" {
			continue
		}
		key, value, _ := strings.Cut(record, "\n")
		entries = append(entries, GitConfigEntry{Key: key, Value: value})
	}
	return entries
}
