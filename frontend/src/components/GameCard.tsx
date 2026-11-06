import PortNotice from './PortNotice';
import {portActionLabel} from '../hooks/usePortActions';
import {CircleAlert, Code2, ExternalLink, FolderOpen, LoaderCircle, MoreHorizontal, Play, Square} from 'lucide-react';
import type {KeyboardEvent} from 'react';
import ProjectIcon from './ProjectIcon';
import StatusLabel from './StatusLabel';
import {displayURL, formatCPU, formatMemory, isActive, serviceVisualState} from '../utils';
import type {ResourceUsage, ServiceView} from '../types';

const engineLabels: Record<string, string> = {
    godot: 'GODOT',
    unity: 'UNITY',
    phaser: 'PHASER',
    node: 'WEB GAME',
    generic: 'GAME',
};

export default function GameCard({service, index, selected, busy, usage, iconURL, onSelect, onToggle, onModeChange, onOpenVSCode, onReveal, onOpenURL, onMenu}: {
    service: ServiceView; index: number; selected: boolean; busy: boolean; usage?: ResourceUsage; iconURL?: string;
    onSelect: () => void; onToggle: () => void; onOpenVSCode: () => void; onReveal: () => void; onOpenURL: () => void;
    onModeChange: (mode: 'release' | 'debug') => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
    const release = service.launchMode === 'release';
    const modeLabel = release ? '正式版' : 'Debug';
    const command = release ? service.releaseCommand ?? '' : service.command;
    const portLabel = portActionLabel(service);
    const transition = service.status === 'starting' || service.status === 'stopping';
    const engine = service.projectType in engineLabels ? service.projectType : 'generic';
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('button, input')) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); }
    };
    return <article className={`game-card engine-${engine} state-${serviceVisualState(service)}${selected ? ' is-selected' : ''}`}
        onClick={onSelect} onKeyDown={handleKeyDown} tabIndex={0} aria-current={selected}>
        <div className="game-card-top">
            <span className="game-sequence">{String(index + 1).padStart(2, '0')}</span>
            <ProjectIcon projectType={service.projectType} projectName={service.name} iconURL={iconURL}/>
            <div className="game-identity"><span>{engineLabels[engine]}</span><h3 title={service.name}>{service.name}</h3></div>
            <StatusLabel service={service} compact/>
            <button className="icon-button game-menu" type="button" aria-label={`${service.name} 更多操作`} title="更多操作" onClick={event => { event.stopPropagation(); onMenu(event); }}><MoreHorizontal size={17}/></button>
        </div>
        <div className={service.pathExists ? 'game-path' : 'game-path is-invalid'} title={service.directory}>
            {!service.pathExists && <CircleAlert size={12}/>}<span>{service.directory}</span>
        </div>
        <div className="game-launch-row">
            <div className="game-mode-switch" role="group" aria-label={`${service.name} 启动模式`}>
                {(['release', 'debug'] as const).map(mode => <button type="button" key={mode} aria-pressed={(mode === 'release') === release}
                    disabled={busy || transition || isActive(service)} title={mode === 'release' && !service.releaseCommand ? '配置正式版启动命令' : isActive(service) ? '停止游戏后可切换' : undefined}
                    onClick={event => { event.stopPropagation(); onModeChange(mode); }}>{mode === 'release' ? '正式' : 'Debug'}</button>)}
            </div>
            <span className="game-mode-hint">{release ? '已导出的版本' : '当前源码'}</span>
        </div>
        <code className="game-command" title={command}>{command}</code>
        <div className="game-runtime-line">
            {service.url ? <button className="game-url" type="button" onClick={event => { event.stopPropagation(); onOpenURL(); }}><ExternalLink size={11}/><span>{displayURL(service.url)}</span></button> : <span className="game-native">NATIVE RUNTIME</span>}
            {isActive(service) && <span className="game-usage">CPU {formatCPU(usage?.cpuPercent ?? 0)} · MEM {formatMemory(usage?.memoryBytes ?? 0)}</span>}
        </div>
        {service.lastError && !(service.port && service.lastError.startsWith('启动失败：端口')) && <div className="game-error" title={service.lastError}>{service.lastError}</div>}
        <PortNotice service={service}/>
        <div className="game-actions">
            <button type="button" className={isActive(service) ? 'game-action stop' : 'game-action start'} onClick={event => { event.stopPropagation(); onToggle(); }}
                disabled={busy || transition || !service.pathExists} aria-label={portLabel ? `${portLabel} ${service.name}` : isActive(service) ? `停止 ${service.name}` : `启动 ${modeLabel} ${service.name}`}>
                {busy || transition ? <LoaderCircle className="spin" size={14}/> : isActive(service) ? <Square size={11}/> : <Play size={13}/>}
                <span>{portLabel || (isActive(service) ? `停止 ${modeLabel}` : `启动 ${modeLabel}`)}</span>
            </button>
            <button type="button" className="game-action" onClick={event => { event.stopPropagation(); onOpenVSCode(); }} disabled={!service.pathExists}
                aria-label={`在 VS Code 中打开 ${service.name}`} title="在 VS Code 中打开"><Code2 size={14}/><span>VS Code</span></button>
            <button type="button" className="game-action" onClick={event => { event.stopPropagation(); onReveal(); }} disabled={!service.pathExists}
                aria-label={`在 Finder 中显示 ${service.name}`} title="在 Finder 中显示"><FolderOpen size={14}/><span>Finder</span></button>
        </div>
    </article>;
}
