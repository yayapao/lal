export namespace main {
	
	export class ServiceView {
	    id: string;
	    name: string;
	    directory: string;
	    command: string;
	    url?: string;
	    cleanCommand: string;
	    promptFiles?: string[];
	    promptFile?: string;
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
	        this.directory = source["directory"];
	        this.command = source["command"];
	        this.url = source["url"];
	        this.cleanCommand = source["cleanCommand"];
	        this.promptFiles = source["promptFiles"];
	        this.promptFile = source["promptFile"];
	        this.projectType = source["projectType"];
	        this.status = source["status"];
	        this.pid = source["pid"];
	        this.startedAt = source["startedAt"];
	        this.lastError = source["lastError"];
	        this.pathExists = source["pathExists"];
	        this.health = source["health"];
	        this.healthInfo = source["healthInfo"];
	    }
	}
	export class AppState {
	    services: ServiceView[];
	    configPath: string;
	    warning: string;
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.services = this.convertValues(source["services"], ServiceView);
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
	        this.directory = source["directory"];
	        this.command = source["command"];
	        this.url = source["url"];
	        this.cleanCommand = source["cleanCommand"];
	    }
	}

}

