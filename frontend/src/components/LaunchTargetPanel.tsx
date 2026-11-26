import {ChevronDown, ChevronRight, ExternalLink, LoaderCircle, Play, Square} from 'lucide-react';
import {useEffect, useState} from 'react';
import {OpenServiceURL, StartService, StopService} from '../../wailsjs/lal/app';
import type {ServiceView} from '../types';
import {displayURL, errorMessage, isActive} from '../utils';
import StatusLabel from './StatusLabel';
import PortNotice from './PortNotice';
import '../styles/launch-targets.css';

export default function LaunchTargetPanel({service, disabled, selectedTargetId, onSelectTarget, flat = false}: {
    service: ServiceView; disabled: boolean; selectedTargetId: string; onSelectTarget: (id: string) => void;
    flat?: boolean;
}) {
    const [expanded, setExpanded] = useState(!!selectedTargetId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { if (selectedTargetId) setExpanded(true); }, [selectedTargetId]);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true); setError('');
        try { await action(); } catch (failure) { setError(errorMessage(failure)); }
        finally { setBusy(false); }
    };
    const locked = disabled || busy;
    const views = service.targetViews ?? [];
    const running = views.filter(isActive).length;
    const unavailable = views.filter(view => view.status === 'failed' || view.health === 'unreachable').length;
    const compactURL = (url: string) => {
        try { const value = new URL(url); return ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname) && value.port ? `:${value.port}` : displayURL(url); }
        catch { return displayURL(url); }
    };
    return <div className={`launch-target-panel${flat ? ' is-flat' : ''}`} onClick={event => event.stopPropagation()}>
        {!flat && <button className="target-disclosure" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown size={13} className={expanded ? 'is-open' : ''}/>{running} / {service.launchTargets?.length} 个进程运行中{unavailable > 0 && <span className="target-unavailable"> · {unavailable} 个不可用</span>}</button>}
        {(flat || expanded) && <div className="target-list">
            {service.launchTargets?.map(target => {
                const id = `${service.id}::${target.id}`;
                const view = views.find(item => item.id === id);
                const selected = selectedTargetId === id;
                return <div className={`target-row${selected ? ' is-selected' : ''}`} key={target.id}>
                    <button className="target-select" type="button" aria-label={`查看 ${target.name} 的日志`} aria-pressed={selected}
                        title={`${target.name}${target.default ? ' · 默认启动' : ''}\n${target.command}`}
                        onClick={() => onSelectTarget(id)}>
                        <span className="target-log-hint">{selected ? '查看中' : '查看日志'}<ChevronRight size={12}/></span>
                    </button>
                    <div className="target-main">
                        {flat && <span className="target-status">{view && <StatusLabel service={view} compact/>}</span>}
                        <span className="target-identity" title={target.name}>{target.name}{!flat && target.default && <span className="target-default">默认</span>}</span>
                        {!flat && <span className="target-status">{view && <StatusLabel service={view} compact/>}</span>}
                        {flat && target.url && view && <button className="service-url" type="button" title={`打开 ${target.url}`} aria-label={`打开 ${target.name}：${target.url}`}
                            onClick={() => void run(() => OpenServiceURL(view.id))}>{compactURL(target.url)}</button>}
                        {view && <button type="button" className="icon-button subtle" aria-label={`${isActive(view) ? '停止' : '启动'}进程 ${target.name}`} disabled={locked || view.status === 'stopping' || !view.pathExists}
                            onClick={() => void run(() => isActive(view) ? StopService(view.id) : StartService(view.id))}>{busy ? <LoaderCircle className="spin" size={13}/> : isActive(view) ? <Square size={11}/> : <Play size={13}/>}</button>}
                    </div>
                    {!flat && <code title={target.command}>{target.command}</code>}
                    {!flat && target.url && view && <button className="service-url" type="button" onClick={() => void run(() => OpenServiceURL(view.id))}><ExternalLink size={11}/>{displayURL(target.url)}</button>}
                    {view && <PortNotice service={view}/>}
                    {view?.lastError && <span className="service-error">{view.lastError}</span>}
                </div>;
            })}
        </div>}
        {error && <div className="service-error" role="alert">{error}</div>}
    </div>;
}
