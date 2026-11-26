import {useState} from 'react';
import {ExternalLink, Globe, LoaderCircle, Play, Square} from 'lucide-react';
import {OpenGodotWeb, StartGodotWeb, StopGodotWeb} from '../../wailsjs/lal/app';
import type {ServiceView} from '../types';
import {displayURL, errorMessage} from '../utils';
import '../styles/godot-web.css';

export default function GodotWebPreview({service, onChanged, onError}: {
    service: ServiceView; onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    const web = service.godotWeb;
    if (!web) return null;
    const external = web.status === 'external';
    const running = web.status === 'running' || external;
    const building = service.status === 'building';
    const label = external ? '外部可访问' : running ? '运行中' : web.status === 'failed' ? '启动失败' : web.available ? '已停止' : '待导出';
    const action = async (operation: 'start' | 'stop' | 'open') => {
        setBusy(true);
        try {
            if (operation === 'stop') await StopGodotWeb(service.id);
            else {
                if (operation === 'start') await StartGodotWeb(service.id);
                await OpenGodotWeb(service.id);
            }
        } catch (error) {
            onError(errorMessage(error));
        } finally {
            try { await onChanged(); } finally { setBusy(false); }
        }
    };
    return <section className={`godot-web state-${web.status}`} aria-label={`${service.name} 浏览器服务`}>
        <div className="godot-web-heading"><Globe size={13}/><strong>浏览器游玩</strong><span role="status"><i/>{label}</span></div>
        <div className="godot-web-location" title={web.entryPath || web.lastError}>
            {running && web.url ? <button type="button" onClick={event => { event.stopPropagation(); void action('open'); }} disabled={busy}>
                <ExternalLink size={11}/>{displayURL(web.url)}</button> : <span>{web.entryPath || '未配置 Web 导出预设'}</span>}
        </div>
        {web.lastError && <div className="godot-web-error" title={web.lastError}>{web.lastError}</div>}
        <div className="godot-web-actions">
            <button type="button" className="game-action" disabled={busy || (!running && (!web.available || building || !service.pathExists))}
                aria-label={`${running ? '打开游玩' : '启动浏览器'} ${service.name}`}
                title={building ? '等待构建完成后启动' : web.lastError || undefined}
                onClick={event => { event.stopPropagation(); void action(running ? 'open' : 'start'); }}>
                {busy ? <LoaderCircle size={13} className="spin"/> : running ? <ExternalLink size={13}/> : <Play size={12}/>}
                {running ? '打开游玩' : '启动浏览器'}
            </button>
            {running && !external && <button type="button" className="game-action stop" disabled={busy} aria-label={`停止浏览器服务 ${service.name}`}
                onClick={event => { event.stopPropagation(); void action('stop'); }}><Square size={10}/>停止服务</button>}
        </div>
    </section>;
}
