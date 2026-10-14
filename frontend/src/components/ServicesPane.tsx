import {LoaderCircle, Play, Square, TerminalSquare, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import SelectionCheckbox from './SelectionCheckbox';
import ServiceRow from './ServiceRow';
import WorkspaceGroupSection from './WorkspaceGroupSection';
import type {BatchBusyState, ResourceUsage, ServiceView, WorkspaceGroup} from '../types';

const collapsedGroupsKey = 'lal:collapsed-workspaces';

export default function ServicesPane({loading, query, total, selectedId, filteredServices, workspaceGroups, showWorkspaceGroups,
    checkedIds, checkedStartableCount, checkedStoppableCount, allVisibleChecked, someVisibleChecked, batchBusy,
    iconURLs, resourceUsage, busyIds, onToggleVisibleSelection, onStartSelected, onStopSelected, onClearSelection,
    onOpenWorkspaceManager, onAdd, onSelectService, onToggleService, onCheckService, onOpenURL, onMenu}: {
    loading: boolean;
    query: string;
    total: number;
    selectedId: string;
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
    busyIds: Set<string>;
    onToggleVisibleSelection: () => void;
    onStartSelected: () => void;
    onStopSelected: () => void;
    onClearSelection: () => void;
    onOpenWorkspaceManager: () => void;
    onAdd: () => void;
    onSelectService: (id: string) => void;
    onToggleService: (service: ServiceView) => void;
    onCheckService: (id: string) => void;
    onOpenURL: (service: ServiceView) => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>, service: ServiceView) => void;
}) {
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
            iconURL={iconURLs[service.id]}
            usage={resourceUsage[service.id]}
            busy={busyIds.has(service.id) || batchBusy?.startsWith('all') === true || (batchBusy?.startsWith('selected') === true && checkedIds.has(service.id))}
            onSelect={() => onSelectService(service.id)} onToggle={() => onToggleService(service)}
            onCheck={() => onCheckService(service.id)} selectionDisabled={batchBusy !== null}
            onOpenURL={() => onOpenURL(service)} onMenu={event => onMenu(event, service)}/>
    );
    return (
        <section className="services-pane" aria-label="服务列表">
            <div className="pane-heading">
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
                    <button className="text-button workspace-manager-button" type="button" onClick={onOpenWorkspaceManager}>Workspace 管理</button></div>}
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
            </div>
        </section>
    );
}
