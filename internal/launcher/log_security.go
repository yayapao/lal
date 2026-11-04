package launcher

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

const redactedValue = "[REDACTED]"

var (
	privateKeyLog    = regexp.MustCompile(`(?s)-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----.*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----`)
	credentialURLLog = regexp.MustCompile(`(?i)(\b[a-z][a-z0-9+.-]*://)[^\s/@]+@`)
	authLog          = regexp.MustCompile(`(?i)(\b(?:authorization|proxy-authorization)["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|(?:bearer|basic)\s+[^\s"',;\}\]]+|\[REDACTED\]|[^\s"',;\}\]]+)`)
	credentialLog    = regexp.MustCompile(`(?i)(\b(?:[a-z][a-z0-9]*[_-])*(?:api[_-]?key|access[_-]?key[_-]?id|secret[_-]?access[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|password|passwd|secret|client[_-]?secret|private[_-]?key)\b["']?\s*(?:[:=]\s*|\s+))("(?:[^"\\]|\\.)*"|'[^']*'|\[REDACTED\]|[^\s,;\}\]&]+)`)
	cookieLog        = regexp.MustCompile(`(?im)(\b(?:cookie|set-cookie)["']?\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'[^']*'|[^\r\n]+)`)
	providerKeyLog   = regexp.MustCompile(`\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b`)
)

// Mask common credentials before logs reach memory, frontend events or disk.
// This is best effort; arbitrary application output can contain other secrets.
func redactLog(text string) string {
	text = privateKeyLog.ReplaceAllString(text, redactedValue)
	text = credentialURLLog.ReplaceAllString(text, "${1}"+redactedValue+"@")
	for _, pattern := range []*regexp.Regexp{authLog, credentialLog, cookieLog} {
		text = pattern.ReplaceAllStringFunc(text, func(match string) string {
			parts := pattern.FindStringSubmatch(match)
			value := redactedValue
			if len(parts[2]) >= 2 && (parts[2][0] == '"' || parts[2][0] == '\'') {
				value = parts[2][:1] + value + parts[2][:1]
			}
			return parts[1] + value
		})
	}
	return providerKeyLog.ReplaceAllString(text, redactedValue)
}

// Always replace with a fresh 0600 inode; never follow an existing symlink or
// retain the permissions of an older exported log.
func writePrivateLog(path, content string) error {
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return fmt.Errorf("日志目标必须是普通文件")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".lal-log-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.WriteString(content); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), filepath.Clean(path))
}
