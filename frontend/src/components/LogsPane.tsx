import {Download, ExternalLink, ListEnd, LoaderCircle, TerminalSquare, Trash2} from 'lucide-react';
import LogLine, {groupLogEntries} from '../LogLine';
import GitBadge from './GitBadge';
import PackagePanel from './PackagePanel';
import ResourceMonitor from './ResourceMonitor';
import StatusLabel from './StatusLabel';
import {displayURL} from '../utils';
import type {AppModule, GitStatus, LogEntry, ResourceUsage, ServiceView} from '../types';
import {gitCounts} from '../gitUtils';
import {useLayoutEffect, useMemo, useRef} from 'react';
import {analyzeBuildLogs, createRepairPrompt, failurePosition} from '../buildDiagnostics';
import BuildFailureActions from './BuildFailureActions';

export default function LogsPane({service, selectedTargetId, onSelectTarget, logs, logBlocks, autoScroll, onToggleAutoScroll, downloadingLogs, onDownloadLogs,
    onClearLogs, scriptBusy, onRunScript, onStopScript, usage, history, onOpenURL, gitStatus, onOpenGit, module = 'service'}: {
    service: ServiceView | null;
    selectedTargetId: string;
    onSelectTarget: (id: string) => void;
    gitStatus?: GitStatus;
    onOpenGit: () => void;
    logs: LogEntry[];
    logBlocks: ReturnType<typeof groupLogEntries>;
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
    downloadingLogs: boolean;
    onDownloadLogs: () => void;
    onClearLogs: () => void;
    scriptBusy: boolean;
    onRunScript: (service: ServiceView, scriptName: string) => void;
    onStopScript: (service: ServiceView) => void;
    usage?: ResourceUsage;
    history: ResourceUsage[];
    onOpenURL: (service: ServiceView) => void;
    module?: AppModule;
}) {
    const selectedTarget = service?.targetViews?.find(target => target.id === selectedTargetId);
    const activeFilter = selectedTarget?.id ?? '';
    const visibleLogs = activeFilter ? logs.filter(entry => entry.targetId === activeFilter) : logs;
    const visibleBlocks = activeFilter ? groupLogEntries(visibleLogs) : logBlocks;
    const diagnosticsService = selectedTarget ?? service;
    const urlService = selectedTarget ?? service;
    const viewportRef = useRef<HTMLDivElement>(null);
    const noun = module === 'game' ? '游戏' : '服务';
    const diagnostics = useMemo(() => analyzeBuildLogs(service && logs.every(entry => entry.serviceId === service.id) ? visibleBlocks : [], diagnosticsService), [visibleBlocks, logs, service, diagnosticsService]);
    const repairPrompt = useMemo(() => diagnosticsService && diagnostics.latest
        ? createRepairPrompt(diagnosticsService, visibleBlocks, diagnostics.latest) : '', [diagnosticsService, visibleBlocks, diagnostics.latest]);
    useLayoutEffect(() => {
        if (autoScroll && viewportRef.current) viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }, [logs, autoScroll, service?.id, activeFilter]);
    return <section className="logs-pane" aria-label={`${noun}日志`}>
        <div className="log-heading">
            <div className="log-title"><TerminalSquare size={17}/><span>{service?.name ?? `${noun}日志`}</span>{service && <StatusLabel service={service} compact/>}</div>
            <div className="log-actions">
                {Boolean(service?.launchTargets?.length) && <select className={`target-log-select${activeFilter ? ' is-filtered' : ''}`} aria-label="日志进程" value={activeFilter} onChange={event => onSelectTarget(event.target.value)}><option value="">全部进程</option>{service?.targetViews?.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}</select>}
                {urlService?.url && <button className="log-url" type="button" onClick={() => void onOpenURL(urlService)} title={`打开 ${urlService.url}`}>
                    <ExternalLink size={13}/><span>{displayURL(urlService.url)}</span>
                </button>}
                <button className={autoScroll ? 'icon-button subtle is-pressed' : 'icon-button subtle'} type="button" role="switch" aria-checked={autoScroll}
                    onClick={onToggleAutoScroll} aria-label="自动跟随日志" title="自动跟随日志" disabled={!service}><ListEnd size={16}/></button>
                <button className="icon-button subtle" type="button" onClick={onDownloadLogs} aria-label={activeFilter ? '下载全部进程日志' : '下载日志'} title={activeFilter ? '下载全部进程日志' : '下载日志'}
                    disabled={!service || logs.length === 0 || downloadingLogs}>{downloadingLogs ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}</button>
                <button className="icon-button subtle" type="button" onClick={onClearLogs} aria-label={activeFilter ? '清空全部进程日志' : '清空日志'} title={activeFilter ? '清空全部进程日志' : '清空日志'} disabled={!service || logs.length === 0}><Trash2 size={16}/></button>
            </div>
        </div>
        {service && <div className="log-git-summary"><GitBadge status={gitStatus} name={service.name} onOpen={onOpenGit}/>
            <span>{gitStatus && gitCounts(gitStatus)}</span><button className="text-button" type="button" onClick={onOpenGit}>Git 详情</button></div>}
        <ResourceMonitor service={service} usage={usage} history={history}/>
        {service?.packageInfo && <PackagePanel key={service.id} service={service} busy={scriptBusy}
            onRun={scriptName => onRunScript(service, scriptName)} onStop={() => onStopScript(service)}/>}
        {service && repairPrompt && <BuildFailureActions key={`${service.id}-${diagnostics.latest?.end}-${visibleBlocks[diagnostics.latest!.end].timestamp}`}
            service={diagnosticsService ?? service} prompt={repairPrompt}/>}
        <div className="log-viewport" ref={viewportRef}>
            {!service ? <div className="console-empty">未选择{noun}</div>
                : visibleLogs.length === 0 ? <div className="console-empty">暂无日志</div>
                    : <div className="log-lines">{visibleBlocks.map((entry, index) => (
                        <LogLine entry={entry} fallbackService={selectedTarget?.name ?? service.name} failurePosition={failurePosition(diagnostics.ranges, index)} key={`${entry.timestamp}-${index}`}/>
                    ))}</div>}
        </div>
        {service && <div className="console-footer"><span>{service.directory}</span><span className="console-log-scope">{selectedTarget && <span className="console-target">{selectedTarget.name}</span>}<span>{visibleLogs.length} 行</span></span></div>}
    </section>;
}
