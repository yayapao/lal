package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

type GitConfigEdit struct {
	Directory      string   `json:"directory"`
	Root           string   `json:"root"`
	Key            string   `json:"key"`
	ExpectedValues []string `json:"expectedValues"`
	Values         []string `json:"values"`
}

var gitConfigName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]*$`)

func canonicalGitKey(key string) (string, error) {
	key = strings.TrimSpace(key)
	first, last := strings.IndexByte(key, '.'), strings.LastIndexByte(key, '.')
	if len(key) > 512 || first < 1 || !gitConfigName.MatchString(key[:first]) ||
		!gitConfigName.MatchString(key[last+1:]) || strings.ContainsAny(key, "\x00\n\r") {
		return "", fmt.Errorf("配置键格式应为 section.name，例如 user.email")
	}
	if first == last {
		return strings.ToLower(key), nil
	}
	return strings.ToLower(key[:first]) + key[first:last+1] + strings.ToLower(key[last+1:]), nil
}

// Stage one key's complete value list, then atomically replace the local config
// under Git's config.lock. Other keys and the original file mode are retained.
func (m *serviceManager) UpdateGitConfig(id string, input GitConfigEdit) error {
	key, err := canonicalGitKey(input.Key)
	if err != nil {
		return err
	}
	if len(input.Values) > 128 {
		return fmt.Errorf("单个配置键不能超过 128 个值")
	}
	for _, value := range input.Values {
		if len(value) > 65536 || strings.ContainsRune(value, '\x00') {
			return fmt.Errorf("配置值不能超过 64 KB 或包含空字符")
		}
	}
	service, err := m.serviceByID(id)
	if err != nil {
		return err
	}
	if input.Directory != service.Directory {
		return fmt.Errorf("项目目录已变化，请重新读取 Git 配置")
	}
	ctx, cancel := context.WithTimeout(context.Background(), gitProbeTimeout)
	defer cancel()
	output, err := runGit(ctx, service.Directory, "rev-parse", "--show-toplevel")
	if err != nil {
		return err
	}
	root := strings.TrimSuffix(string(output), "\n")
	if input.Root != root {
		return fmt.Errorf("Git 仓库已变化，请重新读取配置")
	}
	output, err = runGit(ctx, root, "rev-parse", "--git-path", "config")
	if err != nil {
		return err
	}
	configPath := strings.TrimSuffix(string(output), "\n")
	if !filepath.IsAbs(configPath) {
		configPath = filepath.Join(root, configPath)
	}
	configPath, err = filepath.EvalSymlinks(configPath)
	if err != nil {
		return fmt.Errorf("无法定位本地 Git 配置：%w", err)
	}
	lockPath := configPath + ".lock"
	lock, err := os.OpenFile(lockPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("无法锁定 Git 配置，可能正在被其他程序修改：%w", err)
	}
	ownsLock := true
	defer func() {
		lock.Close()
		if ownsLock {
			os.Remove(lockPath)
		}
	}()
	info, err := os.Stat(configPath)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 8*1024*1024 {
		return fmt.Errorf("本地 Git 配置无法读取或超过 8 MB")
	}
	original, err := os.ReadFile(configPath)
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(configPath), ".lal-git-config-*")
	if err != nil {
		return err
	}
	tempPath := temporary.Name()
	defer os.Remove(tempPath)
	defer os.Remove(tempPath + ".lock")
	if _, err = temporary.Write(original); err != nil {
		temporary.Close()
		return err
	}
	if err = temporary.Close(); err != nil {
		return err
	}
	output, err = runGit(ctx, root, "config", "--file", tempPath, "--null", "--list")
	if err != nil {
		return fmt.Errorf("无法读取 Git 配置：%w", err)
	}
	current := []string{}
	for _, entry := range parseGitConfig(output) {
		if entry.Key == key {
			current = append(current, entry.Value)
		}
	}
	if !slices.Equal(current, input.ExpectedValues) {
		return fmt.Errorf("%s 已被其他程序修改，请重新读取后编辑", key)
	}
	if slices.Equal(current, input.Values) {
		return nil
	}
	if len(current) > 0 {
		if _, err = runGit(ctx, root, "config", "--file", tempPath, "--unset-all", "--", key); err != nil {
			return fmt.Errorf("修改 Git 配置失败：%w", err)
		}
	}
	for _, value := range input.Values {
		if _, err = runGit(ctx, root, "config", "--file", tempPath, "--add", "--", key, value); err != nil {
			return fmt.Errorf("修改 Git 配置失败：%w", err)
		}
	}
	updated, err := os.ReadFile(tempPath)
	if err != nil {
		return err
	}
	latest, err := os.ReadFile(configPath)
	if err != nil || !bytes.Equal(original, latest) {
		return fmt.Errorf("本地 Git 配置已变化，请重新读取后编辑")
	}
	serviceNow, err := m.serviceByID(id)
	if err != nil || serviceNow.Directory != input.Directory {
		return fmt.Errorf("项目目录已变化，请重新读取 Git 配置")
	}
	if err = lock.Chmod(info.Mode().Perm()); err != nil {
		return err
	}
	if _, err = lock.Write(updated); err != nil {
		return err
	}
	if err = lock.Sync(); err != nil {
		return err
	}
	if err = lock.Close(); err != nil {
		return err
	}
	if err = os.Rename(lockPath, configPath); err != nil {
		return fmt.Errorf("保存 Git 配置失败：%w", err)
	}
	ownsLock = false
	return nil
}
