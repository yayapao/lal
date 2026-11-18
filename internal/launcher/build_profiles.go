package launcher

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

// BuildProfile is a named, standalone export command; it never changes startup.
type BuildProfile struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Command string `json:"command"`
}

const maxBuildProfiles = 16

var buildProfileID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`)

func normalizeBuildProfiles(profiles []BuildProfile) []BuildProfile {
	if len(profiles) == 0 {
		return nil
	}
	result := make([]BuildProfile, len(profiles))
	for i, profile := range profiles {
		result[i] = BuildProfile{strings.TrimSpace(profile.ID), strings.TrimSpace(profile.Name), strings.TrimSpace(profile.Command)}
	}
	return result
}

func validateBuildProfiles(profiles []BuildProfile) error {
	if len(profiles) > maxBuildProfiles {
		return fmt.Errorf("打包方案最多 %d 个", maxBuildProfiles)
	}
	ids, names := map[string]bool{}, map[string]bool{}
	for _, profile := range profiles {
		if !buildProfileID.MatchString(profile.ID) {
			return fmt.Errorf("打包方案 ID 须为 1–64 位字母、数字、下划线或连字符，并以字母或数字开头")
		}
		if strings.TrimSpace(profile.Name) == "" || len([]rune(profile.Name)) > 80 {
			return fmt.Errorf("打包方案名称须为 1–80 个字符")
		}
		if strings.TrimSpace(profile.Command) == "" || len(profile.Command) > maxCleanCommandLength {
			return fmt.Errorf("打包方案 %q 须填写命令，且不能超过 %d 个字符", profile.Name, maxCleanCommandLength)
		}
		if ids[profile.ID] || names[profile.Name] {
			return fmt.Errorf("打包方案的 ID 和名称不能重复")
		}
		ids[profile.ID], names[profile.Name] = true, true
	}
	return nil
}

func detectedBuildProfiles(directory string) ([]BuildProfile, error) {
	text := readDetectionText(filepath.Join(directory, lalManifestFilename))
	if text == "" {
		return nil, nil
	}
	var manifest lalProjectManifest
	if err := json.Unmarshal([]byte(text), &manifest); err != nil {
		return nil, err
	}
	profiles := normalizeBuildProfiles(manifest.BuildProfiles)
	return profiles, validateBuildProfiles(profiles)
}

func applyDetectedBuildProfiles(result *ProjectDetection) {
	profiles, err := detectedBuildProfiles(result.Directory)
	if err != nil {
		result.Warnings = append(result.Warnings, ".lal.json 打包方案无效，已忽略："+err.Error())
		return
	}
	result.BuildProfiles = profiles
}

// BuildGameProfile executes a saved profile without launching any artifact.
func (m *serviceManager) BuildGameProfile(id, profileID string) error {
	if profileID == "" {
		return fmt.Errorf("请选择打包方案")
	}
	return m.startGameProcess(id, true, profileID)
}

func gameBuildCommand(service Service, profileID string) (string, string, error) {
	if service.Module != moduleGame {
		return "", "", fmt.Errorf("只有游戏支持构建并导出")
	}
	if profileID == "" {
		if strings.TrimSpace(service.BuildCommand) == "" {
			return "", "", fmt.Errorf("请先在游戏配置中填写构建并导出命令")
		}
		return service.BuildCommand, "默认构建", nil
	}
	for _, profile := range service.BuildProfiles {
		if profile.ID == profileID {
			return profile.Command, profile.Name, nil
		}
	}
	return "", "", fmt.Errorf("打包方案不存在，请刷新游戏配置")
}
