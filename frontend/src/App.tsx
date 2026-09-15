import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import './styles/base.css';
import './styles/panes.css';
import './styles/service-list.css';
import './styles/service-row.css';
import './styles/prompts.css';
import './styles/logs.css';
import './styles/console.css';
import './styles/dialogs.css';
import './styles/overlays.css';
import {groupLogEntries} from './LogLine';
import ContextMenu from './components/ContextMenu';
import {CacheDialog, DeleteDialog, IssueDialog} from './components/ConfirmDialogs';
import LogsPane from './components/LogsPane';
import PromptManager from './components/PromptManager';
import ServiceDialog from './components/ServiceDialog';
import ServicesPane from './components/ServicesPane';
import Toast from './components/Toast';
import Toolbar from './components/Toolbar';
import WorkspaceManagerDialog from './components/WorkspaceManagerDialog';
import {usePromptActions} from './hooks/usePromptActions';
import {useResourceUsage} from './hooks/useResourceUsage';
import {useServiceActions} from './hooks/useServiceActions';
import {useServiceIcons} from './hooks/useServiceIcons';
import {useServiceState} from './hooks/useServiceState';
import {ungroupedWorkspace} from './types';
import type {BatchBusyState, DialogState, MenuState, OperationIssue, PromptFileView, ServiceView, ToastState, WorkspaceGroup} from './types';
import {isActive, isStoppable} from './utils';

function App() {
    const [query, setQuery] = useState('');
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [batchBusy, setBatchBusy] = useState<BatchBusyState>(null);
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ServiceView | null>(null);
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [downloadingLogs, setDownloadingLogs] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [cacheTarget, setCacheTarget] = useState<ServiceView | null>(null);
    const [cacheBusyId, setCacheBusyId] = useState('');
    const [rightView, setRightView] = useState<'logs' | 'prompts'>('logs');
    const [prompts, setPrompts] = useState<PromptFileView[]>([]);
    const [promptLoading, setPromptLoading] = useState(false);
    const [promptSyncing, setPromptSyncing] = useState(false);
    const [promptError, setPromptError] = useState('');
    const [addingPrompt, setAddingPrompt] = useState(false);
    const [promptBusy, setPromptBusy] = useState<{path: string; action: 'copy' | 'open' | 'remove'} | null>(null);
    const [operationIssue, setOperationIssue] = useState<OperationIssue | null>(null);
    const [scriptBusyId, setScriptBusyId] = useState('');
    const [workspaceManager, setWorkspaceManager] = useState<Record<string, string> | null>(null);
    const [workspaceSaving, setWorkspaceSaving] = useState(false);
    const [toast, setToast] = useState<ToastState | null>(null);
    const [, setClock] = useState(0);
    const logViewportRef = useRef<HTMLDivElement>(null);
    const toastTimerRef = useRef<number | null>(null);

    const showToast = useCallback((message: string, kind: ToastState['kind'] = 'success') => {
        setToast({message, kind});
        if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
    }, []);

    const {services, selectedId, setSelectedId, checkedIds, setCheckedIds, logs, setLogs, loading, refreshState} = useServiceState(showToast);
    const {resourceUsage, resourceHistory} = useResourceUsage();
    const iconURLs = useServiceIcons(services);

    const selectedService = services.find(service => service.id === selectedId) ?? null;
    const selectedUsage = selectedService ? resourceUsage[selectedService.id] : undefined;
    const selectedResourceHistory = selectedService ? resourceHistory[selectedService.id] ?? [] : [];
    const logBlocks = useMemo(() => groupLogEntries(logs), [logs]);
    const runningCount = services.filter(isActive).length;
    const readyCount = services.filter(service => service.health === 'ready').length;
    const filteredServices = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase();
        if (!keyword) return services;
        return services.filter(service => [service.name, service.directory, service.command, service.url ?? '']
            .some(value => value.toLocaleLowerCase().includes(keyword)));
    }, [query, services]);
    const workspaceGroups = useMemo(() => {
        const groups = new Map<string, WorkspaceGroup>();
        for (const service of filteredServices) {
            const name = service.workspace || ungroupedWorkspace;
            const group = groups.get(name);
            if (group) group.services.push(service);
            else groups.set(name, {name, services: [service]});
        }
        return [...groups.values()];
    }, [filteredServices]);
    const showWorkspaceGroups = workspaceGroups.length > 1 || workspaceGroups[0]?.name !== ungroupedWorkspace;
    const checkedServices = useMemo(() => services.filter(service => checkedIds.has(service.id)), [checkedIds, services]);
    const checkedStartableCount = checkedServices.filter(service => !isActive(service) && service.pathExists).length;
    const checkedStoppableCount = checkedServices.filter(isStoppable).length;
    const visibleCheckedCount = filteredServices.filter(service => checkedIds.has(service.id)).length;
    const allVisibleChecked = filteredServices.length > 0 && visibleCheckedCount === filteredServices.length;
    const someVisibleChecked = visibleCheckedCount > 0 && !allVisibleChecked;

    const serviceActions = useServiceActions({
        selectedId, logs, checkedServices, filteredServices, allVisibleChecked, cacheTarget, deleteTarget,
        refreshState, showToast, setBusyIds, setBatchBusy, setOperationIssue, setMenu, setDialog, setDeleteTarget,
        setCacheTarget, setCacheBusyId, setScriptBusyId, setCheckedIds, setLogs, setRefreshing, setDownloadingLogs,
    });
    const promptActions = usePromptActions({
        services, workspaceManager, refreshState, showToast, setPrompts, setPromptLoading, setPromptError,
        setPromptSyncing, setPromptBusy, setAddingPrompt, setMenu, setSelectedId, setRightView,
        setWorkspaceManager, setWorkspaceSaving,
    });

    useEffect(() => {
        if (rightView !== 'prompts' || !selectedId) return;
        void promptActions.loadPrompts(selectedId);
    }, [promptActions.loadPrompts, rightView, selectedId]);

    useEffect(() => {
        const timer = window.setInterval(() => setClock(value => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setMenu(null); setDialog(null); setDeleteTarget(null); setCacheTarget(null); setOperationIssue(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useLayoutEffect(() => {
        if (!autoScroll || !logViewportRef.current) return;
        logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight;
    }, [logs, autoScroll, selectedId]);

    useEffect(() => () => {
        if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    }, []);

    return (
        <div className="app-shell">
            <Toolbar query={query} onQueryChange={setQuery} total={services.length} running={runningCount} ready={readyCount}
                refreshing={refreshing} batchBusy={batchBusy}
                onRefresh={() => void serviceActions.refreshAppState()} onBatch={action => void serviceActions.runBatch(action)}
                onAdd={() => setDialog({mode: 'create'})}/>

            <main className="workspace">
                <ServicesPane loading={loading} query={query} total={services.length} selectedId={selectedId}
                    filteredServices={filteredServices} workspaceGroups={workspaceGroups} showWorkspaceGroups={showWorkspaceGroups}
                    checkedIds={checkedIds} checkedStartableCount={checkedStartableCount} checkedStoppableCount={checkedStoppableCount}
                    allVisibleChecked={allVisibleChecked} someVisibleChecked={someVisibleChecked} batchBusy={batchBusy}
                    iconURLs={iconURLs} resourceUsage={resourceUsage} busyIds={busyIds}
                    onToggleVisibleSelection={serviceActions.toggleVisibleSelection}
                    onStartSelected={() => void serviceActions.runSelectedBatch('start')}
                    onStopSelected={() => void serviceActions.runSelectedBatch('stop')}
                    onClearSelection={() => setCheckedIds(new Set())}
                    onOpenWorkspaceManager={promptActions.openWorkspaceManager}
                    onAdd={() => setDialog({mode: 'create'})}
                    onSelectService={id => { setSelectedId(id); setRightView('logs'); }}
                    onToggleService={service => void serviceActions.toggleService(service)}
                    onCheckService={serviceActions.toggleChecked}
                    onOpenURL={service => void serviceActions.openServiceURL(service)}
                    onMenu={(event, service) => serviceActions.openMenu(event, service)}/>

                {rightView === 'prompts' && selectedService ? (
                    <PromptManager service={selectedService} prompts={prompts} loading={promptLoading} error={promptError}
                        adding={addingPrompt} syncing={promptSyncing} busy={promptBusy}
                        onAdd={() => void promptActions.addPrompt(selectedService)} onRetry={() => void promptActions.loadPrompts(selectedService.id)}
                        onSync={() => void promptActions.syncPrompts(selectedService)}
                        onCopy={prompt => void promptActions.copyCodexPrompt(selectedService, prompt)}
                        onOpen={prompt => void promptActions.openCodexWithPrompt(selectedService, prompt)}
                        onRemove={prompt => void promptActions.removePrompt(selectedService, prompt)}
                        onBack={() => setRightView('logs')}/>
                ) : <LogsPane service={selectedService} logs={logs} logBlocks={logBlocks} autoScroll={autoScroll}
                    onToggleAutoScroll={() => setAutoScroll(value => !value)}
                    downloadingLogs={downloadingLogs} onDownloadLogs={() => void serviceActions.downloadSelectedLogs()}
                    onClearLogs={() => void serviceActions.clearSelectedLogs()}
                    scriptBusy={scriptBusyId === selectedService?.id}
                    onRunScript={(service, scriptName) => void serviceActions.runPackageScript(service, scriptName)}
                    onStopScript={service => void serviceActions.stopPackageScript(service)}
                    usage={selectedUsage} history={selectedResourceHistory}
                    onOpenURL={service => void serviceActions.openServiceURL(service)}/>}
            </main>

            {menu && <ContextMenu menu={menu} cacheBusy={cacheBusyId !== ''} onClose={() => setMenu(null)}
                onPromptManager={promptActions.openPromptManager}
                onEdit={service => { setDialog({mode: 'edit', service}); setMenu(null); }}
                onRestart={service => void serviceActions.restartService(service)}
                onCache={service => { setCacheTarget(service); setMenu(null); }}
                onReveal={service => void serviceActions.revealService(service)}
                onRemove={service => { setDeleteTarget(service); setMenu(null); }}/>}

            {dialog && (
                <ServiceDialog state={dialog} onClose={() => setDialog(null)} onSaved={async service => {
                    setDialog(null); setSelectedId(service.id);
                    showToast(dialog.mode === 'create' ? `${service.name} 已添加` : `${service.name} 已更新`);
                    await refreshState();
                }}/>
            )}

            {deleteTarget && <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => void serviceActions.confirmDelete()}/>}
            {cacheTarget && <CacheDialog target={cacheTarget} busy={cacheBusyId !== ''} onClose={() => setCacheTarget(null)} onConfirm={() => void serviceActions.confirmClearNextCache()}/>}
            {operationIssue && <IssueDialog issue={operationIssue} onClose={() => setOperationIssue(null)}/>}
            {workspaceManager && <WorkspaceManagerDialog services={services} drafts={workspaceManager} saving={workspaceSaving}
                onDraftChange={promptActions.updateWorkspaceDraft} onClose={() => setWorkspaceManager(null)} onSave={() => void promptActions.saveWorkspaces()}/>}
            {toast && <Toast toast={toast}/>}
        </div>
    );
}

export default App;
