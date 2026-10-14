import {Download, ExternalLink, ListEnd, LoaderCircle, TerminalSquare, Trash2} from 'lucide-react';
import LogLine, {groupLogEntries} from '../LogLine';
import GitBadge from './GitBadge';
import PackagePanel from './PackagePanel';
import ResourceMonitor from './ResourceMonitor';
import StatusLabel from './StatusLabel';
import {displayURL} from '../utils';
import type {GitStatus, LogEntry, ResourceUsage, ServiceView} from '../types';
import {gitCounts} from '../gitUtils';

export default function LogsPane({service, logs, logBlocks, autoScroll, onToggleAutoScroll, downloadingLogs, onDownloadLogs,
    onClearLogs, scriptBusy, onRunScript, onStopScript, usage, history, onOpenURL, gitStatus, onOpenGit}: {
    service: ServiceView | null;
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
}) {
    return <section className="logs-pane" aria-label="服务日志">
        <div className="log-heading">
            <div className="log-title"><TerminalSquare size={17}/><span>{service?.name ?? '日志'}</span>{service && <StatusLabel service={service} compact/>}</div>
            <div className="log-actions">
                {service?.url && <button className="log-url" type="button" onClick={() => void onOpenURL(service)} title={`打开 ${service.url}`}>
                    <ExternalLink size={13}/><span>{displayURL(service.url)}</span>
                </button>}
                <button className={autoScroll ? 'icon-button subtle is-pressed' : 'icon-button subtle'} type="button" role="switch" aria-checked={autoScroll}
                    onClick={onToggleAutoScroll} aria-label="自动跟随日志" title="自动跟随日志" disabled={!service}><ListEnd size={16}/></button>
                <button className="icon-button subtle" type="button" onClick={onDownloadLogs} aria-label="下载日志" title="下载日志"
                    disabled={!service || logs.length === 0 || downloadingLogs}>{downloadingLogs ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}</button>
                <button className="icon-button subtle" type="button" onClick={onClearLogs} aria-label="清空日志" title="清空日志" disabled={!service || logs.length === 0}><Trash2 size={16}/></button>
            </div>
        </div>
        {service && <div className="log-git-summary"><GitBadge status={gitStatus} name={service.name} onOpen={onOpenGit}/>
            <span>{gitStatus && gitCounts(gitStatus)}</span><button className="text-button" type="button" onClick={onOpenGit}>Git 详情</button></div>}
        <ResourceMonitor service={service} usage={usage} history={history}/>
        {service?.packageInfo && <PackagePanel key={service.id} service={service} busy={scriptBusy}
            onRun={scriptName => onRunScript(service, scriptName)} onStop={() => onStopScript(service)}/>}
        <div className="log-viewport">
            {!service ? <div className="console-empty">未选择服务</div>
                : logs.length === 0 ? <div className="console-empty">暂无日志</div>
                    : <div className="log-lines">{logBlocks.map((entry, index) => (
                        <LogLine entry={entry} fallbackService={service.name} key={`${entry.timestamp}-${index}`}/>
                    ))}</div>}
        </div>
        {service && <div className="console-footer"><span>{service.directory}</span><span>{logs.length} 行</span></div>}
    </section>;
}
