import {LoaderCircle, Package, Play, Square} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {ServiceView} from '../types';

export default function PackagePanel({service, busy, onRun, onStop}: {
    service: ServiceView;
    busy: boolean;
    onRun: (scriptName: string) => void;
    onStop: () => void;
}) {
    const info = service.packageInfo;
    const scripts = info?.scripts ?? [];
    const [scriptName, setScriptName] = useState(scripts[0]?.name ?? '');
    useEffect(() => {
        if (service.activeScript) setScriptName(service.activeScript);
    }, [service.activeScript]);
    if (!info) return null;

    const runningScript = service.scriptStatus === 'running' ? service.activeScript : '';
    const stopping = service.scriptStatus === 'stopping';
    const currentScript = scripts.find(item => item.name === (runningScript || scriptName));

    return <section className="package-panel" aria-label={`${service.name} Package 脚本`}>
        <div className="package-identity">
            <span className="package-icon"><Package size={15}/></span>
            <div className="package-summary">
                <strong title={info.name || service.name}>{info.name || service.name}{info.version ? ` @ ${info.version}` : ''}</strong>
                {info.description && <span title={info.description}>{info.description}</span>}
            </div>
            {info.packageManager && <span className="package-manager" title={info.packageManager}>{info.packageManager}</span>}
        </div>
        <div className="package-run">
            <select className="package-script-select" value={scriptName} onChange={event => setScriptName(event.target.value)}
                aria-label={`${service.name} npm 脚本`} disabled={scripts.length === 0 || Boolean(runningScript) || stopping || busy}>
                {scripts.length === 0 && <option value="">无脚本</option>}
                {scripts.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
            {runningScript || stopping ? (
                <button className="button secondary package-action" type="button" onClick={onStop}
                    disabled={!runningScript || stopping || busy} aria-label={`停止 ${runningScript || scriptName} 脚本`}>
                    {busy || stopping ? <LoaderCircle className="spin" size={14}/> : <Square size={13}/>}停止脚本
                </button>
            ) : (
                <button className="button secondary package-action" type="button" onClick={() => currentScript && onRun(currentScript.name)}
                    disabled={!currentScript || busy} aria-label={`运行 ${currentScript?.name ?? ''} 脚本`}>
                    {busy ? <LoaderCircle className="spin" size={14}/> : <Play size={14}/>}运行脚本
                </button>
            )}
        </div>
        <div className={`package-status is-${service.scriptStatus || 'idle'}`} title={service.scriptStatusInfo || undefined}>
            <span className="package-status-dot"/>
            <span>{runningScript ? `${runningScript} 运行中` : stopping ? `${service.activeScript || scriptName} 停止中` : ({completed: '上次脚本已完成', failed: '上次脚本异常', stopped: '上次脚本已停止'} as Record<string, string>)[service.scriptStatus ?? ''] ?? '未执行脚本'}</span>
        </div>
    </section>;
}
