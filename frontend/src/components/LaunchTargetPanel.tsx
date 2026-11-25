import {ChevronDown, ExternalLink, LoaderCircle, Play, Square} from 'lucide-react';
import {useEffect, useState} from 'react';
import {OpenServiceURL, SetDefaultLaunchTargets, StartLaunchTargets, StartService, StopService} from '../../wailsjs/lal/app';
import type {ServiceView} from '../types';
import {displayURL, errorMessage, isActive} from '../utils';
import StatusLabel from './StatusLabel';
import PortNotice from './PortNotice';
import '../styles/launch-targets.css';

export default function LaunchTargetPanel({service, disabled}: {service: ServiceView; disabled: boolean}) {
    const defaultsKey = JSON.stringify(service.launchTargets?.filter(t => t.default).map(t => t.id) ?? []);
    const [selected, setSelected] = useState<string[]>(() => JSON.parse(defaultsKey));
    const [expanded, setExpanded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { setSelected(JSON.parse(defaultsKey)); }, [defaultsKey]);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true); setError('');
        try { await action(); } catch (failure) { setError(errorMessage(failure)); }
        finally { setBusy(false); }
    };
    const locked = disabled || busy;
    const views = service.targetViews ?? [];
    const running = views.filter(isActive).length;
    return <div className="launch-target-panel" onClick={event => event.stopPropagation()}>
        <button className="target-disclosure" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown size={13} className={expanded ? 'is-open' : ''}/>{running} / {service.launchTargets?.length} 个进程运行中</button>
        {expanded && <div className="target-list">
            {service.launchTargets?.map(target => {
                const view = views.find(item => item.id === `${service.id}::${target.id}`);
                return <div className="target-row" key={target.id}>
                    <div className="target-main"><label className="target-checkbox"><input type="checkbox" aria-label={`选择进程 ${target.name}`} checked={selected.includes(target.id)} disabled={locked}
                        onChange={event => setSelected(current => event.target.checked ? [...current, target.id] : current.filter(id => id !== target.id))}/><span>{target.name}</span></label>
                        {target.default && <span className="target-default">默认</span>}
                        {view && <StatusLabel service={view} compact/>}
                        {view && <button type="button" className="icon-button subtle" aria-label={`${isActive(view) ? '停止' : '启动'}进程 ${target.name}`} disabled={locked || view.status === 'stopping' || !view.pathExists}
                            onClick={() => void run(() => isActive(view) ? StopService(view.id) : StartService(view.id))}>{busy ? <LoaderCircle className="spin" size={13}/> : isActive(view) ? <Square size={11}/> : <Play size={13}/>}</button>}
                    </div>
                    <code title={target.command}>{target.command}</code>
                    {target.url && view && <button className="service-url" type="button" onClick={() => void run(() => OpenServiceURL(view.id))}><ExternalLink size={11}/>{displayURL(target.url)}</button>}
                    {view && <PortNotice service={view}/>}
                    {view?.lastError && <span className="service-error">{view.lastError}</span>}
                </div>;
            })}
            <div className="target-actions"><button className="text-button" type="button" disabled={locked || !selected.length} onClick={() => void run(() => StartLaunchTargets(service.id, selected))}>启动所选</button>
                <button className="text-button" type="button" disabled={locked || JSON.stringify([...selected].sort()) === JSON.stringify([...JSON.parse(defaultsKey)].sort())} onClick={() => void run(() => SetDefaultLaunchTargets(service.id, selected))}>设为默认</button></div>
        </div>}
        {error && <div className="service-error" role="alert">{error}</div>}
    </div>;
}
