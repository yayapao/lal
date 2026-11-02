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

export default function GameCard({service, index, selected, busy, usage, iconURL, onSelect, onToggle, onOpenVSCode, onReveal, onOpenURL, onMenu}: {
    service: ServiceView; index: number; selected: boolean; busy: boolean; usage?: ResourceUsage; iconURL?: string;
    onSelect: () => void; onToggle: () => void; onOpenVSCode: () => void; onReveal: () => void; onOpenURL: () => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
    const transition = service.status === 'starting' || service.status === 'stopping';
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('button, input')) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); }
    };
    return <article className={`game-card state-${serviceVisualState(service)}${selected ? ' is-selected' : ''}`}
        onClick={onSelect} onKeyDown={handleKeyDown} tabIndex={0} aria-current={selected}>
        <div className="game-card-top">
            <span className="game-sequence">{String(index + 1).padStart(2, '0')}</span>
            <ProjectIcon projectType={service.projectType} projectName={service.name} iconURL={iconURL}/>
            <div className="game-identity"><span>{engineLabels[service.projectType] ?? 'GAME'}</span><h3 title={service.name}>{service.name}</h3></div>
            <StatusLabel service={service} compact/>
            <button className="icon-button game-menu" type="button" aria-label={`${service.name} 更多操作`} title="更多操作" onClick={event => { event.stopPropagation(); onMenu(event); }}><MoreHorizontal size={17}/></button>
        </div>
        <div className={service.pathExists ? 'game-path' : 'game-path is-invalid'} title={service.directory}>
            {!service.pathExists && <CircleAlert size={12}/>}<span>{service.directory}</span>
        </div>
        <code className="game-command" title={service.command}>{service.command}</code>
        <div className="game-runtime-line">
            {service.url ? <button className="game-url" type="button" onClick={event => { event.stopPropagation(); onOpenURL(); }}><ExternalLink size={11}/><span>{displayURL(service.url)}</span></button> : <span className="game-native">NATIVE RUNTIME</span>}
            {isActive(service) && <span className="game-usage">CPU {formatCPU(usage?.cpuPercent ?? 0)} · MEM {formatMemory(usage?.memoryBytes ?? 0)}</span>}
        </div>
        {service.lastError && <div className="game-error" title={service.lastError}>{service.lastError}</div>}
        <div className="game-actions">
            <button type="button" className={isActive(service) ? 'game-action stop' : 'game-action start'} onClick={event => { event.stopPropagation(); onToggle(); }}
                disabled={busy || transition || !service.pathExists} aria-label={isActive(service) ? `停止 ${service.name}` : `启动 ${service.name}`}>
                {busy || transition ? <LoaderCircle className="spin" size={14}/> : isActive(service) ? <Square size={11}/> : <Play size={13}/>}
                <span>{isActive(service) ? '停止' : '启动'}</span>
            </button>
            <button type="button" className="game-action" onClick={event => { event.stopPropagation(); onOpenVSCode(); }} disabled={!service.pathExists}
                aria-label={`在 VS Code 中打开 ${service.name}`} title="在 VS Code 中打开"><Code2 size={14}/><span>VS Code</span></button>
            <button type="button" className="game-action" onClick={event => { event.stopPropagation(); onReveal(); }} disabled={!service.pathExists}
                aria-label={`在 Finder 中显示 ${service.name}`} title="在 Finder 中显示"><FolderOpen size={14}/><span>Finder</span></button>
        </div>
    </article>;
}
