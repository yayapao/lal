import {Ellipsis, Layers3, ListChecks, LoaderCircle, Play, Settings2, Square, TerminalSquare, GitBranch, FolderCog} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {StartService, StopService} from '../../wailsjs/lal/app';
import type {ServiceView} from '../types';
import {errorMessage, isActive, isStoppable, needsDefaultStart} from '../utils';
import LaunchTargetPanel from './LaunchTargetPanel';
import DefaultLaunchTargetsDialog from './DefaultLaunchTargetsDialog';

export default function MonorepoPane({projects, selectedId, selectedTargetId, busy,
    onSelectService, onSelectTarget, onOpenGit, onOpenWorkspaceManager, onDefaultsSaved, onMenu}: {
    projects: ServiceView[]; selectedId: string; selectedTargetId: string; busy: boolean;
    onSelectService: (id: string) => void;
    onSelectTarget: (serviceId: string, targetId: string) => void;
    onOpenGit: (service: ServiceView) => void;
    onOpenWorkspaceManager: () => void;
    onDefaultsSaved: () => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>, service: ServiceView) => void;
}) {
    const [pending, setPending] = useState<string | null>(null);
    const [failure, setFailure] = useState({id: '', message: ''});
    const [defaultsProject, setDefaultsProject] = useState<ServiceView | null>(null);
    const menuRef = useRef<HTMLDetailsElement>(null);
    const closeMenu = () => menuRef.current?.removeAttribute('open');
    const closeDefaults = () => { setDefaultsProject(null); menuRef.current?.querySelector('summary')?.focus(); };
    useEffect(() => {
        const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) closeMenu(); };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && menuRef.current?.open) {
                closeMenu(); menuRef.current.querySelector('summary')?.focus();
            }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, []);
    const project = projects.find(service => service.id === selectedId) ?? projects[0];
    if (!project) return <div className="empty-state monorepo-empty"><TerminalSquare size={25}/><span>暂无 Monorepo 项目</span></div>;
    const locked = busy || pending !== null;
    const running = project.targetViews?.filter(isActive).length ?? 0;
    const hasTargets = Boolean(project.launchTargets?.length);
    const defaults = project.launchTargets?.filter(target => target.default) ?? [];
    const run = async (action: 'start' | 'stop') => {
        closeMenu(); setPending(action); setFailure({id: '', message: ''});
        try { await (action === 'start' ? StartService(project.id) : StopService(project.id)); }
        catch (error) { setFailure({id: project.id, message: errorMessage(error)}); }
        finally { setPending(null); }
    };
    return <div className="monorepo-pane">
        <header className="monorepo-context">
            <div className="monorepo-project-line">
                <select className="monorepo-project-select" aria-label="Monorepo 项目" value={project.id} title={project.directory}
                    onChange={event => { closeMenu(); onSelectService(event.target.value); }}>
                    {projects.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
                <details ref={menuRef} className="monorepo-menu" key={project.id}>
                    <summary aria-label={`${project.name} 项目操作`} title="项目操作">{pending ? <LoaderCircle className="spin" size={15}/> : <Ellipsis size={17}/>}</summary>
                    <div className="monorepo-menu-items">
                        <button type="button" disabled={locked || !project.pathExists || !needsDefaultStart(project)} title={!hasTargets ? project.command : defaults.length ? `启动 ${defaults.map(target => target.name).join('、')}` : '请先配置默认启动服务'} onClick={() => void run('start')}><Play size={13}/>{hasTargets ? '启动默认' : '启动项目'}</button>
                        {hasTargets && <button type="button" disabled={locked} onClick={() => { closeMenu(); setDefaultsProject(project); }}><ListChecks size={13}/>配置默认启动<span className="monorepo-menu-count" aria-hidden="true">{defaults.length}</span></button>}
                        <button type="button" disabled={locked || !isStoppable(project)} onClick={() => void run('stop')}><Square size={12}/>停止项目</button>
                        <button type="button" className="monorepo-menu-divider" onClick={() => { closeMenu(); onOpenGit(project); }}><GitBranch size={13}/>Git 详情</button>
                        <button type="button" onClick={event => { onMenu(event, project); closeMenu(); }}><Settings2 size={13}/>配置与管理</button>
                        <button type="button" onClick={() => { closeMenu(); onOpenWorkspaceManager(); }}><FolderCog size={13}/>Workspace 管理</button>
                    </div>
                </details>
            </div>
            <div className="monorepo-running">{hasTargets ? `${running} / ${project.launchTargets?.length} 运行` : '使用根启动命令'}</div>
            {!project.pathExists && <div className="service-error">项目路径失效</div>}
            {project.lastError && <div className="service-error">{project.lastError}</div>}
            {failure.id === project.id && <div className="service-error" role="alert">{failure.message}</div>}
        </header>
        <div className="monorepo-content">
            <button type="button" className="monorepo-all-logs" aria-pressed={selectedId === project.id && !selectedTargetId}
                onClick={() => onSelectService(project.id)}><Layers3 size={13}/><span>全部日志</span></button>
            {!hasTargets && <div className="empty-state"><span>尚未配置项目进程</span><button className="text-button" type="button" onClick={event => onMenu(event, project)}>配置项目进程</button></div>}
            <LaunchTargetPanel key={project.id} service={project} disabled={locked} flat selectedTargetId={selectedId === project.id ? selectedTargetId : ''}
                onSelectTarget={targetId => onSelectTarget(project.id, targetId)}/>
        </div>
        {defaultsProject && projects.some(service => service.id === defaultsProject.id) && <DefaultLaunchTargetsDialog service={defaultsProject} onClose={closeDefaults}
            onSaved={() => { closeDefaults(); onDefaultsSaved(); }}/>}
    </div>;
}
