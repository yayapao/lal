package launcher

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
)

func (m *serviceManager) GetResourceUsage() ([]ResourceUsage, error) {
	m.mu.RLock()
	serviceIDs := make([]string, 0, len(m.services))
	groupServiceIDs := make(map[int]string, len(m.processes))
	for _, service := range m.services {
		serviceIDs = append(serviceIDs, service.ID)
		if process, running := m.processes[service.ID]; running && process.cmd.Process != nil {
			groupServiceIDs[process.cmd.Process.Pid] = service.ID
		}
	}
	m.mu.RUnlock()

	if len(groupServiceIDs) == 0 {
		return parseResourceUsage("", groupServiceIDs, serviceIDs), nil
	}
	cmd := exec.Command("/bin/ps", "-axo", "pgid=,%cpu=,rss=")
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("读取资源使用情况失败：%w", err)
	}
	return parseResourceUsage(string(output), groupServiceIDs, serviceIDs), nil
}

func parseResourceUsage(output string, groupServiceIDs map[int]string, serviceIDs []string) []ResourceUsage {
	usageByID := make(map[string]*ResourceUsage, len(serviceIDs))
	for _, id := range serviceIDs {
		usageByID[id] = &ResourceUsage{ServiceID: id}
	}

	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) != 3 {
			continue
		}
		groupID, groupErr := strconv.Atoi(fields[0])
		serviceID, tracked := groupServiceIDs[groupID]
		cpu, cpuErr := strconv.ParseFloat(fields[1], 64)
		memoryKB, memoryErr := strconv.ParseUint(fields[2], 10, 64)
		usage, known := usageByID[serviceID]
		if groupErr != nil || !tracked || cpuErr != nil || memoryErr != nil || !known {
			continue
		}
		usage.CPUPercent += max(cpu, 0)
		usage.MemoryBytes += memoryKB * 1024
		usage.ProcessCount++
	}

	result := make([]ResourceUsage, 0, len(usageByID))
	for _, usage := range usageByID {
		result = append(result, *usage)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ServiceID < result[j].ServiceID })
	return result
}
