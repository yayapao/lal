package launcher

import "fmt"

func (m *serviceManager) StartAll() BatchResult {
	return m.StartServices(m.serviceIDs())
}

func (m *serviceManager) StartServices(ids []string) BatchResult {
	result := BatchResult{}
	for _, id := range uniqueIDs(ids) {
		service, err := m.serviceByID(id)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if m.isRunningOrStarting(id) {
			result.Skipped++
			continue
		}
		if err := m.StartService(id); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s：%v", service.Name, err))
			continue
		}
		result.Changed++
	}
	return result
}

func (m *serviceManager) StopAll() BatchResult {
	return m.StopServices(m.serviceIDs())
}

func (m *serviceManager) StopServices(ids []string) BatchResult {
	result := BatchResult{}
	for _, id := range uniqueIDs(ids) {
		service, err := m.serviceByID(id)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			continue
		}
		if !m.isStoppable(id) {
			result.Skipped++
			continue
		}
		if err := m.StopService(id); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s：%v", service.Name, err))
			continue
		}
		result.Changed++
	}
	return result
}

func (m *serviceManager) GetLogs(id string) []LogEntry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]LogEntry(nil), m.logs[id]...)
}

func (m *serviceManager) ClearLogs(id string) {
	m.mu.Lock()
	m.logs[id] = nil
	m.mu.Unlock()
	m.emitEvent("service:logs-cleared", map[string]string{"serviceId": id})
}
