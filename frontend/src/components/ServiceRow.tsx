import {CircleAlert, Ellipsis, ExternalLink, LoaderCircle, Play, Square} from 'lucide-react';
import type {KeyboardEvent} from 'react';
import ProjectIcon from './ProjectIcon';
import StatusLabel from './StatusLabel';
import {displayURL, formatCPU, formatMemory, formatUptime, isActive, serviceVisualState} from '../utils';
import type {ResourceUsage, ServiceView} from '../types';

export default function ServiceRow({service, usage, selected, checked, busy, selectionDisabled, iconURL, onSelect, onCheck, onToggle, onOpenURL, onMenu}: {
    service: ServiceView; usage?: ResourceUsage; selected: boolean; checked: boolean; busy: boolean; selectionDisabled: boolean; iconURL?: string;
    onSelect: () => void; onCheck: () => void; onToggle: () => void;
    onOpenURL: () => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
    const transition = service.status === 'starting' || service.status === 'stopping';
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('button, input')) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); }
    };
    return (
        <article className={`service-row${selected ? ' is-selected' : ''}${checked ? ' is-checked' : ''}`} onClick={onSelect} onKeyDown={handleKeyDown} tabIndex={0} aria-current={selected}>
            <span className={`service-accent state-${serviceVisualState(service)}`}/>
            <div className="service-leading">
                <input className="selection-checkbox service-selector" type="checkbox" checked={checked} disabled={selectionDisabled}
                    onClick={event => event.stopPropagation()} onChange={onCheck} aria-label={`选择 ${service.name}`}/>
                <ProjectIcon projectType={service.projectType} projectName={service.name} iconURL={iconURL}/>
            </div>
            <div className="service-copy">
                <div className="service-name-line"><h3>{service.name}</h3>{service.pid > 0 && <span className="pid">PID {service.pid}</span>}{service.startedAt && isActive(service) && <span className="uptime">{formatUptime(service.startedAt)}</span>}
                    {isActive(service) && <span className="service-resources"><span>CPU {formatCPU(usage?.cpuPercent ?? 0)}</span><span>MEM {formatMemory(usage?.memoryBytes ?? 0)}</span></span>}
                </div>
                <div className={service.pathExists ? 'service-path' : 'service-path path-invalid'} title={service.directory}>{!service.pathExists && <CircleAlert size={12}/>}<span>{service.directory}</span></div>
                <div className="service-meta">
                    <code className="service-command" title={service.command}>{service.command}</code>
                    {service.url && <button className="service-url" type="button" onClick={event => { event.stopPropagation(); onOpenURL(); }} title={`打开 ${service.url}`}>
                        <ExternalLink size={11}/><span>{displayURL(service.url)}</span>
                    </button>}
                </div>
                {service.lastError && <div className="service-error" title={service.lastError}>{service.lastError}</div>}
            </div>
            <StatusLabel service={service}/>
            <div className="row-actions">
                <button className={isActive(service) ? 'icon-button stop-button' : 'icon-button start-button'} type="button"
                    onClick={event => { event.stopPropagation(); onToggle(); }} aria-label={isActive(service) ? `停止 ${service.name}` : `启动 ${service.name}`}
                    title={isActive(service) ? '停止' : '启动'} disabled={busy || transition || !service.pathExists}>
                    {busy || transition
                        ? <LoaderCircle className="spin" size={17}/>
                        : isActive(service) ? <Square size={14}/> : <Play size={17}/>
                    }
                </button>
                <button className="icon-button row-menu-button" type="button" onClick={onMenu} aria-label={`${service.name} 更多操作`} title="更多操作"><Ellipsis size={18}/></button>
            </div>
        </article>
    );
}
