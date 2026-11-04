package launcher

type GitStatus struct {
	ServiceID string `json:"serviceId"`
	Directory string `json:"directory"`
	State     string `json:"state"`
	Root      string `json:"root"`
	Branch    string `json:"branch"`
	Commit    string `json:"commit"`
	Detached  bool   `json:"detached"`
	Unborn    bool   `json:"unborn"`
	Upstream  string `json:"upstream"`
	Ahead     int    `json:"ahead"`
	Behind    int    `json:"behind"`
	Changed   int    `json:"changed"`
	Staged    int    `json:"staged"`
	Unstaged  int    `json:"unstaged"`
	Untracked int    `json:"untracked"`
	Conflicts int    `json:"conflicts"`
	Error     string `json:"error"`
	CheckedAt string `json:"checkedAt"`
}

type GitChange struct {
	Path           string `json:"path"`
	PreviousPath   string `json:"previousPath"`
	IndexStatus    string `json:"indexStatus"`
	WorktreeStatus string `json:"worktreeStatus"`
	Untracked      bool   `json:"untracked"`
	Conflict       bool   `json:"conflict"`
}

type GitConfigEntry struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type GitDetails struct {
	Status      GitStatus        `json:"status"`
	GitDir      string           `json:"gitDir"`
	Files       []GitChange      `json:"files"`
	Truncated   bool             `json:"truncated"`
	Config      []GitConfigEntry `json:"config"`
	ConfigError string           `json:"configError"`
}
