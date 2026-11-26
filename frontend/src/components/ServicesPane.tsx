import {LoaderCircle, Play, RefreshCw, Square, TerminalSquare, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import SelectionCheckbox from './SelectionCheckbox';
import ServiceRow from './ServiceRow';
import MonorepoPane from './MonorepoPane';
import WorkspaceGroupSection from './WorkspaceGroupSection';
import type {BatchBusyState, GitStatus, ResourceUsage, ServiceView, WorkspaceGroup} from '../types';
import '../styles/monorepo.css';

const collapsedGroupsKey = 'lal:collapsed-workspaces';

export default function ServicesPane({loading, query, total, monorepoCount, refreshing, onRefresh, selectedId, selectedTargetId, onSelectTarget, filteredServices, workspaceGroups, showWorkspaceGroups,
    checkedIds, checkedStartableCount, checkedStoppableCount, allVisibleChecked, someVisibleChecked, batchBusy,
    iconURLs, resourceUsage, gitStatuses, busyIds, onOpenGit, onToggleVisibleSelection, onStartSelected, onStopSelected, onClearSelection,
    onOpenWorkspaceManager, onDefaultsSaved, onAdd, onSelectService, onToggleService, onCheckService, onOpenURL, onMenu, toolbar, footer}: {
    toolbar: ReactNode;
    footer: ReactNode;
    loading: boolean;
    query: string;
    total: number;
    monorepoCount: number;
    refreshing: boolean;
    onRefresh: () => void;
    selectedId: string;
    selectedTargetId: string;
    onSelectTarget: (serviceId: string, targetId: string) => void;
    filteredServices: ServiceView[];
    workspaceGroups: WorkspaceGroup[];
    showWorkspaceGroups: boolean;
    checkedIds: Set<string>;
    checkedStartableCount: number;
    checkedStoppableCount: number;
    allVisibleChecked: boolean;
    someVisibleChecked: boolean;
    batchBusy: BatchBusyState;
    iconURLs: Record<string, string>;
    resourceUsage: Record<string, ResourceUsage>;
    gitStatuses: Record<string, GitStatus>;
    busyIds: Set<string>;
    onToggleVisibleSelection: () => void;
    onStartSelected: () => void;
    onStopSelected: () => void;
    onClearSelection: () => void;
    onOpenWorkspaceManager: () => void;
    onDefaultsSaved: () => void;
    onAdd: () => void;
    onSelectService: (id: string) => void;
    onOpenGit: (service: ServiceView) => void;
    onToggleService: (service: ServiceView) => void;
    onCheckService: (id: string) => void;
    onOpenURL: (service: ServiceView) => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>, service: ServiceView) => void;
}) {
    const [view, setView] = useState<'all' | 'monorepo'>('all');
    const projects = filteredServices.filter(service => service.launchTargets?.length);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
        try {
            const saved: unknown = JSON.parse(window.localStorage.getItem(collapsedGroupsKey) ?? '[]');
            return new Set(Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string') : []);
        } catch { return new Set(); }
    });
    const [searchFolds, setSearchFolds] = useState<{query: string; groups: Set<string>}>({query: '', groups: new Set()});
    const searching = query.trim().length > 0;
    useEffect(() => {
        try { window.localStorage.setItem(collapsedGroupsKey, JSON.stringify([...collapsedGroups])); }
        catch { /* Folding still works when WebView storage is unavailable. */ }
    }, [collapsedGroups]);
    useEffect(() => {
        if (view === 'monorepo' && projects.length && !projects.some(service => service.id === selectedId)) onSelectService(projects[0].id);
    }, [view, projects, selectedId, onSelectService]);
    const openMonorepo = (service: ServiceView) => {
        setView('monorepo'); onClearSelection(); onSelectService(service.id);
    };
    const changeView = (next: 'all' | 'monorepo') => {
        setView(next); onClearSelection();
        if (next === 'monorepo') {
            const project = projects.find(service => service.id === selectedId) ?? projects[0];
            if (project) onSelectService(project.id);
        }
    };

    const toggleGroup = (name: string) => {
        const toggle = (current: Set<string>) => {
            const next = new Set(current);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        };
        if (searching) {
            setSearchFolds(current => ({query, groups: toggle(current.query === query ? current.groups : new Set())}));
        } else {
            setCollapsedGroups(toggle);
        }
    };

    const renderRow = (service: ServiceView) => (
        <ServiceRow key={service.id} service={service} selected={service.id === selectedId} checked={checkedIds.has(service.id)}
            onOpenMonorepo={() => openMonorepo(service)}
            iconURL={iconURLs[service.id]}
            usage={resourceUsage[service.id]}
            gitStatus={gitStatuses[service.id]} onOpenGit={() => onOpenGit(service)}
            busy={busyIds.has(service.id) || batchBusy?.startsWith('all') === true || (batchBusy?.startsWith('selected') === true && checkedIds.has(service.id))}
            onSelect={() => onSelectService(service.id)} onToggle={() => onToggleService(service)}
            onCheck={() => onCheckService(service.id)} selectionDisabled={batchBusy !== null}
            onOpenURL={() => onOpenURL(service)} onMenu={event => onMenu(event, service)}/>
    );
    return (
        <section className={`services-pane${view === 'monorepo' ? ' is-monorepo' : ''}`} aria-label="服务列表">
            {view === 'all' && toolbar}
            <div className="service-browser">
            {(monorepoCount > 0 || view === 'monorepo') && <div className="service-view-bar">
                <div className="service-view-switcher" role="group" aria-label="服务视图">
                    <button type="button" aria-pressed={view === 'all'} disabled={batchBusy !== null} onClick={() => changeView('all')}>全部服务 <span>{total}</span></button>
                    <button type="button" aria-pressed={view === 'monorepo'} disabled={batchBusy !== null} onClick={() => changeView('monorepo')}>Monorepo <span>{monorepoCount}</span></button>
                </div>
                {view === 'monorepo' ? <button className="icon-button subtle monorepo-refresh" type="button" aria-label="刷新状态" title="刷新状态" disabled={refreshing || batchBusy !== null} onClick={onRefresh}><RefreshCw size={13} className={refreshing ? 'spin' : ''}/></button>
                    : <button className="text-button workspace-manager-button" type="button" onClick={onOpenWorkspaceManager}>Workspace 管理</button>}
            </div>}
            {view === 'all' && <><div className="pane-heading">
                <label className="select-all-control">
                    <SelectionCheckbox checked={allVisibleChecked} indeterminate={someVisibleChecked} disabled={batchBusy !== null || filteredServices.length === 0}
                        onChange={onToggleVisibleSelection} ariaLabel="选择当前列表中的全部服务"/>
                    <span>服务</span>
                </label>
                {checkedIds.size > 0 ? <div className="selection-actions">
                    <span className="selection-count">已选 {checkedIds.size}</span>
                    <button className="selection-action" type="button" onClick={onStartSelected}
                        disabled={batchBusy !== null || checkedStartableCount === 0} aria-label="启动选中服务" title="启动选中服务">
                        {batchBusy === 'selected-start' ? <LoaderCircle className="spin" size={14}/> : <Play size={14}/>}
                    </button>
                    <button className="selection-action" type="button" onClick={onStopSelected}
                        disabled={batchBusy !== null || checkedStoppableCount === 0} aria-label="停止选中服务" title="停止选中服务">
                        {batchBusy === 'selected-stop' ? <LoaderCircle className="spin" size={14}/> : <Square size={12}/>}
                    </button>
                    <button className="selection-action" type="button" onClick={onClearSelection} disabled={batchBusy !== null}
                        aria-label="清除选择" title="清除选择"><X size={14}/></button>
                </div> : <div className="pane-heading-actions"><span className="service-count">{query ? `${filteredServices.length} / ${total}` : total}</span>
                    {monorepoCount === 0 && <button className="text-button workspace-manager-button" type="button" onClick={onOpenWorkspaceManager}>Workspace 管理</button>}</div>}
            </div>
            <div className="services-list">
                {loading ? (
                    <div className="skeleton-list" aria-label="正在载入服务">
                        {[0, 1, 2].map(item => <div className="skeleton-row" key={item}><span/><span/><span/></div>)}
                    </div>
                ) : filteredServices.length === 0 ? (
                    <div className="empty-state">
                        <TerminalSquare size={25}/><span>{query ? '没有匹配的服务' : '暂无服务'}</span>
                        {!query && <button className="text-button" type="button" onClick={onAdd}>添加服务</button>}
                    </div>
                ) : showWorkspaceGroups ? workspaceGroups.map(group => (
                    <WorkspaceGroupSection key={group.name} group={group} checkedIds={checkedIds} resourceUsage={resourceUsage}
                        collapsed={searching ? searchFolds.query === query && searchFolds.groups.has(group.name) : collapsedGroups.has(group.name)}
                        onToggle={() => toggleGroup(group.name)}>
                        {group.services.map(renderRow)}
                    </WorkspaceGroupSection>
                )) : filteredServices.map(renderRow)}
            </div></>}
            {view === 'monorepo' && <MonorepoPane projects={projects} selectedId={selectedId} selectedTargetId={selectedTargetId} query={query}
                busy={batchBusy !== null || busyIds.has(projects.find(service => service.id === selectedId)?.id ?? projects[0]?.id ?? '')}
                onSelectService={onSelectService} onSelectTarget={onSelectTarget}
                onOpenGit={onOpenGit} onOpenWorkspaceManager={onOpenWorkspaceManager} onDefaultsSaved={onDefaultsSaved} onMenu={onMenu}/>}
            </div>
            {view === 'all' && footer}
        </section>
    );
}
