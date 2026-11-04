package launcher

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"syscall"
	"unicode/utf8"
)

func (m *serviceManager) GetPrompts(id string) ([]PromptFileView, error) {
	service, err := m.serviceByID(id)
	if err != nil {
		return nil, err
	}
	paths, err := promptPaths(service)
	if err != nil {
		return nil, err
	}
	prompts := make([]PromptFileView, 0, len(paths))
	for _, item := range paths {
		prompt := PromptFileView{
			Name:        filepath.Base(item.path),
			Path:        item.path,
			DisplayPath: displayPromptPath(service.Directory, item.path),
			Source:      item.source,
		}
		prompt.Content, prompt.Error = readAssociatedPrompt(service, item)
		prompts = append(prompts, prompt)
	}
	sort.SliceStable(prompts, func(i, j int) bool {
		if prompts[i].Source != prompts[j].Source {
			return prompts[i].Source == "project"
		}
		return strings.ToLower(prompts[i].DisplayPath) < strings.ToLower(prompts[j].DisplayPath)
	})
	return prompts, nil
}

func (m *serviceManager) AddPromptFile(id, path string) error {
	service, err := m.serviceByID(id)
	if err != nil {
		return err
	}
	path, err = filepath.Abs(strings.TrimSpace(path))
	if err != nil || path == "" {
		return fmt.Errorf("Prompt 文件路径无效")
	}
	path = filepath.Clean(path)
	if len(path) > maxPromptFileLength {
		return fmt.Errorf("Prompt 文件路径不能超过 %d 个字符", maxPromptFileLength)
	}
	if _, readError := readPromptPath(path); readError != "" {
		return errors.New(readError)
	}
	if pathWithin(filepath.Join(service.Directory, defaultPromptsDir), path) {
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		return fmt.Errorf("服务不存在")
	}
	for _, existing := range m.services[index].PromptFiles {
		if resolvePromptPath(m.services[index].Directory, existing) == path {
			return nil
		}
	}
	previous := append([]string(nil), m.services[index].PromptFiles...)
	m.services[index].PromptFiles = append(m.services[index].PromptFiles, path)
	if err := m.saveConfigLocked(); err != nil {
		m.services[index].PromptFiles = previous
		return err
	}
	return nil
}

func (m *serviceManager) RemovePromptFile(id, path string) error {
	path = filepath.Clean(strings.TrimSpace(path))
	m.mu.Lock()
	defer m.mu.Unlock()
	index := m.serviceIndexLocked(id)
	if index < 0 {
		return fmt.Errorf("服务不存在")
	}
	service := m.services[index]
	for promptIndex, configured := range service.PromptFiles {
		if resolvePromptPath(service.Directory, configured) != path {
			continue
		}
		previous := append([]string(nil), service.PromptFiles...)
		m.services[index].PromptFiles = append(service.PromptFiles[:promptIndex], service.PromptFiles[promptIndex+1:]...)
		if err := m.saveConfigLocked(); err != nil {
			m.services[index].PromptFiles = previous
			return err
		}
		return nil
	}
	return fmt.Errorf("项目 prompts 目录下的文件由 LAL 自动发现，无法移除关联")
}

func (m *serviceManager) readCodexPrompt(id, path string) (string, error) {
	service, err := m.serviceByID(id)
	if err != nil {
		return "", err
	}
	configured, err := promptPaths(service)
	if err != nil {
		return "", err
	}
	path = filepath.Clean(strings.TrimSpace(path))
	index := slices.IndexFunc(configured, func(item promptPath) bool { return item.path == path })
	if index < 0 {
		return "", fmt.Errorf("该 Prompt 未关联到服务 %s", service.Name)
	}
	prompt, readError := readAssociatedPrompt(service, configured[index])
	if readError != "" {
		return "", errors.New(readError)
	}
	return prompt, nil
}

func readPromptPath(path string) (string, string) {
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Sprintf("未找到 Prompt 文件：%s", path)
		}
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	defer file.Close()
	return readPromptFile(file)
}

// Project discovery is untrusted; constrain the actual open as well as the scan.
// Explicitly associated external prompts retain their user-selected scope.
func readAssociatedPrompt(service Service, item promptPath) (string, string) {
	if item.source == "added" {
		return readPromptPath(item.path)
	}
	root, err := os.OpenRoot(service.Directory)
	if err != nil {
		return "", fmt.Sprintf("无法打开项目目录：%v", err)
	}
	defer root.Close()
	relative, err := filepath.Rel(service.Directory, item.path)
	if err != nil {
		return "", "Prompt 文件不在项目目录内"
	}
	file, err := root.OpenFile(relative, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return "", fmt.Sprintf("无法安全读取项目 Prompt：%v", err)
	}
	defer file.Close()
	return readPromptFile(file)
}

func readPromptFile(file *os.File) (string, string) {
	info, err := file.Stat()
	if err != nil {
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	if !info.Mode().IsRegular() {
		return "", "Prompt 不是普通文件"
	}
	if info.Size() > maxPromptFileBytes {
		return "", "Prompt 文件不能超过 2 MB"
	}
	data, err := io.ReadAll(io.LimitReader(file, maxPromptFileBytes+1))
	if err != nil {
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	if len(data) > maxPromptFileBytes {
		return "", "Prompt 文件不能超过 2 MB"
	}
	if !utf8.Valid(data) {
		return "", "Prompt 文件必须是 UTF-8 文本"
	}
	prompt := string(data)
	if strings.TrimSpace(prompt) == "" {
		return "", "Prompt 文件为空"
	}
	return prompt, ""
}
