package launcher

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
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
		prompt.Content, prompt.Error = readPromptPath(item.path)
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
	if !slices.ContainsFunc(configured, func(item promptPath) bool { return item.path == path }) {
		return "", fmt.Errorf("该 Prompt 未关联到服务 %s", service.Name)
	}
	prompt, readError := readPromptPath(path)
	if readError != "" {
		return "", errors.New(readError)
	}
	return prompt, nil
}

func readPromptPath(path string) (string, string) {
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Sprintf("未找到 Prompt 文件：%s", path)
		}
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Sprintf("Prompt 不是普通文件：%s", path)
	}
	if info.Size() > maxPromptFileBytes {
		return "", "Prompt 文件不能超过 2 MB"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Sprintf("读取 Prompt 文件失败：%v", err)
	}
	if !utf8.Valid(data) {
		return "", "Prompt 文件必须是 UTF-8 文本"
	}
	prompt := string(data)
	if strings.TrimSpace(prompt) == "" {
		return "", fmt.Sprintf("Prompt 文件为空：%s", path)
	}
	return prompt, ""
}
