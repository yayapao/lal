export namespace main {
	
	export class PackageScript {
	    name: string;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new PackageScript(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.command = source["command"];
	    }
	}
	export class PackageInfo {
	    name?: string;
	    version?: string;
	    description?: string;
	    packageManager?: string;
	    scripts?: PackageScript[];
	
	    static createFrom(source: any = {}) {
	        return new PackageInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.packageManager = source["packageManager"];
	        this.scripts = this.convertValues(source["scripts"], PackageScript);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ServiceView {
	    id: string;
	    name: string;
	    module?: string;
	    workspace?: string;
	    directory: string;
	    command: string;
	    url?: string;
	    cleanCommand: string;
	    promptFiles?: string[];
	    promptFile?: string;
	    packageInfo?: PackageInfo;
	    iconPath?: string;
	    iconVersion?: string;
	    configuredWorkspace?: string;
	    activeScript?: string;
	    scriptStatus?: string;
	    scriptStatusInfo?: string;
	    projectType: string;
	    status: string;
	    pid: number;
	    startedAt: string;
	    lastError: string;
	    pathExists: boolean;
	    health: string;
	    healthInfo: string;
	
	    static createFrom(source: any = {}) {
	        return new ServiceView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.module = source["module"];
	        this.workspace = source["workspace"];
	        this.directory = source["directory"];
	        this.command = source["command"];
	        this.url = source["url"];
	        this.cleanCommand = source["cleanCommand"];
	        this.promptFiles = source["promptFiles"];
	        this.promptFile = source["promptFile"];
	        this.packageInfo = this.convertValues(source["packageInfo"], PackageInfo);
	        this.iconPath = source["iconPath"];
	        this.iconVersion = source["iconVersion"];
	        this.configuredWorkspace = source["configuredWorkspace"];
	        this.activeScript = source["activeScript"];
	        this.scriptStatus = source["scriptStatus"];
	        this.scriptStatusInfo = source["scriptStatusInfo"];
	        this.projectType = source["projectType"];
	        this.status = source["status"];
	        this.pid = source["pid"];
	        this.startedAt = source["startedAt"];
	        this.lastError = source["lastError"];
	        this.pathExists = source["pathExists"];
	        this.health = source["health"];
	        this.healthInfo = source["healthInfo"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppState {
	    services: ServiceView[];
	    workspaces: string[];
	    configPath: string;
	    warning: string;
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.services = this.convertValues(source["services"], ServiceView);
	        this.workspaces = source["workspaces"];
	        this.configPath = source["configPath"];
	        this.warning = source["warning"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BatchResult {
	    changed: number;
	    skipped: number;
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new BatchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.changed = source["changed"];
	        this.skipped = source["skipped"];
	        this.errors = source["errors"];
	    }
	}
	export class GitChange {
	    path: string;
	    previousPath: string;
	    indexStatus: string;
	    worktreeStatus: string;
	    untracked: boolean;
	    conflict: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GitChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.previousPath = source["previousPath"];
	        this.indexStatus = source["indexStatus"];
	        this.worktreeStatus = source["worktreeStatus"];
	        this.untracked = source["untracked"];
	        this.conflict = source["conflict"];
	    }
	}
	export class GitConfigEdit {
	    directory: string;
	    root: string;
	    key: string;
	    expectedValues: string[];
	    values: string[];
	
	    static createFrom(source: any = {}) {
	        return new GitConfigEdit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.directory = source["directory"];
	        this.root = source["root"];
	        this.key = source["key"];
	        this.expectedValues = source["expectedValues"];
	        this.values = source["values"];
	    }
	}
	export class GitConfigEntry {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new GitConfigEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class GitStatus {
	    serviceId: string;
	    directory: string;
	    state: string;
	    root: string;
	    branch: string;
	    commit: string;
	    detached: boolean;
	    unborn: boolean;
	    upstream: string;
	    ahead: number;
	    behind: number;
	    changed: number;
	    staged: number;
	    unstaged: number;
	    untracked: number;
	    conflicts: number;
	    error: string;
	    checkedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new GitStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serviceId = source["serviceId"];
	        this.directory = source["directory"];
	        this.state = source["state"];
	        this.root = source["root"];
	        this.branch = source["branch"];
	        this.commit = source["commit"];
	        this.detached = source["detached"];
	        this.unborn = source["unborn"];
	        this.upstream = source["upstream"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.changed = source["changed"];
	        this.staged = source["staged"];
	        this.unstaged = source["unstaged"];
	        this.untracked = source["untracked"];
	        this.conflicts = source["conflicts"];
	        this.error = source["error"];
	        this.checkedAt = source["checkedAt"];
	    }
	}
	export class GitDetails {
	    status: GitStatus;
	    gitDir: string;
	    files: GitChange[];
	    truncated: boolean;
	    config: GitConfigEntry[];
	    configError: string;
	
	    static createFrom(source: any = {}) {
	        return new GitDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = this.convertValues(source["status"], GitStatus);
	        this.gitDir = source["gitDir"];
	        this.files = this.convertValues(source["files"], GitChange);
	        this.truncated = source["truncated"];
	        this.config = this.convertValues(source["config"], GitConfigEntry);
	        this.configError = source["configError"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LogEntry {
	    serviceId: string;
	    timestamp: string;
	    stream: string;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serviceId = source["serviceId"];
	        this.timestamp = source["timestamp"];
	        this.stream = source["stream"];
	        this.text = source["text"];
	    }
	}
	export class NetworkInterface {
	    name: string;
	    label: string;
	    up: boolean;
	    loopback: boolean;
	    hardware: boolean;
	    ipv4: string[];
	    ipv6: string[];
	    subnetMask: string;
	    gateway: string;
	    mac: string;
	    mtu: number;
	
	    static createFrom(source: any = {}) {
	        return new NetworkInterface(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.label = source["label"];
	        this.up = source["up"];
	        this.loopback = source["loopback"];
	        this.hardware = source["hardware"];
	        this.ipv4 = source["ipv4"];
	        this.ipv6 = source["ipv6"];
	        this.subnetMask = source["subnetMask"];
	        this.gateway = source["gateway"];
	        this.mac = source["mac"];
	        this.mtu = source["mtu"];
	    }
	}
	export class NetworkSnapshot {
	    primaryInterface: string;
	    interfaces: NetworkInterface[];
	    dns: string[];
	    hostname: string;
	    ifconfig: string;
	    warnings: string[];
	    checkedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.primaryInterface = source["primaryInterface"];
	        this.interfaces = this.convertValues(source["interfaces"], NetworkInterface);
	        this.dns = source["dns"];
	        this.hostname = source["hostname"];
	        this.ifconfig = source["ifconfig"];
	        this.warnings = source["warnings"];
	        this.checkedAt = source["checkedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class ProjectScript {
	    name: string;
	    command: string;
	    preview: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectScript(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.command = source["command"];
	        this.preview = source["preview"];
	        this.url = source["url"];
	    }
	}
	export class ProjectDetection {
	    directory: string;
	    name: string;
	    workspace: string;
	    projectType: string;
	    command: string;
	    url: string;
	    cleanCommand: string;
	    scripts: ProjectScript[];
	    sources: string[];
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new ProjectDetection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.directory = source["directory"];
	        this.name = source["name"];
	        this.workspace = source["workspace"];
	        this.projectType = source["projectType"];
	        this.command = source["command"];
	        this.url = source["url"];
	        this.cleanCommand = source["cleanCommand"];
	        this.scripts = this.convertValues(source["scripts"], ProjectScript);
	        this.sources = source["sources"];
	        this.warnings = source["warnings"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PromptFileView {
	    name: string;
	    path: string;
	    displayPath: string;
	    content: string;
	    source: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new PromptFileView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.displayPath = source["displayPath"];
	        this.content = source["content"];
	        this.source = source["source"];
	        this.error = source["error"];
	    }
	}
	export class ResourceUsage {
	    serviceId: string;
	    cpuPercent: number;
	    memoryBytes: number;
	    processCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ResourceUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serviceId = source["serviceId"];
	        this.cpuPercent = source["cpuPercent"];
	        this.memoryBytes = source["memoryBytes"];
	        this.processCount = source["processCount"];
	    }
	}
	export class ServiceInput {
	    name: string;
	    module: string;
	    workspace: string;
	    directory: string;
	    command: string;
	    url: string;
	    cleanCommand: string;
	
	    static createFrom(source: any = {}) {
	        return new ServiceInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.module = source["module"];
	        this.workspace = source["workspace"];
	        this.directory = source["directory"];
	        this.command = source["command"];
	        this.url = source["url"];
	        this.cleanCommand = source["cleanCommand"];
	    }
	}
	
	export class WorkspaceLayout {
	    workspaces: string[];
	    assignments: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.workspaces = source["workspaces"];
	        this.assignments = source["assignments"];
	    }
	}

}

