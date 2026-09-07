import {
    Activity,
    ArrowLeft,
    Atom,
    Box,
    CircleAlert,
    Code2,
    Copy,
    Download,
    Ellipsis,
    ExternalLink,
    FileText,
    FolderOpen,
    LoaderCircle,
    ListEnd,
    MessageSquarePlus,
    Pencil,
    Play,
    Plus,
    Package,
    RefreshCw,
    Search,
    Square,
    TerminalSquare,
    Trash2,
    Unlink,
    X,
    Zap,
} from 'lucide-react';
import {FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import './App.css';
import LogLine, {groupLogEntries} from './LogLine';
import {
    ChooseAndAddPrompt,
    ChooseDirectory,
    ClearNextCache,
    ClearLogs,
    CopyCodexPrompt,
    CreateService,
    DeleteService,
    DownloadLogs,
    GetAppState,
    GetLogs,
    GetPrompts,
    GetResourceUsage,
    OpenCodexWithPrompt,
    OpenServiceURL,
    RevealService,
    RemovePromptFile,
    RestartService,
    StartAll,
    StartServices,
    StartService,
    StopAll,
    StopServices,
    StopService,
    UpdateService,
} from '../wailsjs/go/main/App';
import {main} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';

type ServiceView = main.ServiceView;
type LogEntry = main.LogEntry;
type ResourceUsage = main.ResourceUsage;
type PromptFileView = main.PromptFileView;
type DialogState = {mode: 'create'} | {mode: 'edit'; service: ServiceView};
type ServiceForm = {name: string; directory: string; command: string; url: string; cleanCommand: string};
type ToastState = {kind: 'success' | 'error'; message: string};
type MenuState = {service: ServiceView; left: number; top: number};
type OperationIssue = {title: string; message: string};

const defaultCleanCommand = 'rm -rf .next';
const emptyForm: ServiceForm = {name: '', directory: '', command: 'npm run dev', url: '', cleanCommand: defaultCleanCommand};
const resourceHistoryLength = 60;
function App() {
    const [services, setServices] = useState<ServiceView[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [resourceUsage, setResourceUsage] = useState<Record<string, ResourceUsage>>({});
    const [resourceHistory, setResourceHistory] = useState<Record<string, ResourceUsage[]>>({});
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [batchBusy, setBatchBusy] = useState<'all-start' | 'all-stop' | 'selected-start' | 'selected-stop' | null>(null);
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
    const [toast, setToast] = useState<ToastState | null>(null);
    const [, setClock] = useState(0);
    const selectedIdRef = useRef('');
    const logViewportRef = useRef<HTMLDivElement>(null);
    const toastTimerRef = useRef<number | null>(null);

    const showToast = useCallback((message: string, kind: ToastState['kind'] = 'success') => {
        setToast({message, kind});
        if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 3200);
    }, []);

    const refreshState = useCallback(async () => {
        try {
            const state = await GetAppState();
            const nextServices = state.services ?? [];
            setServices(nextServices);
            setSelectedId(current => current && nextServices.some(service => service.id === current)
                ? current
                : nextServices[0]?.id ?? '');
            setCheckedIds(current => {
                const validIDs = new Set(nextServices.map(service => service.id));
                const next = new Set([...current].filter(id => validIDs.has(id)));
                return next.size === current.size ? current : next;
            });
            if (state.warning) showToast(state.warning, 'error');
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        void refreshState();
        const offState = EventsOn('service:state', () => void refreshState());
        const offServices = EventsOn('services:changed', () => void refreshState());
        const offLog = EventsOn('service:log', (raw: LogEntry) => {
            const entry = main.LogEntry.createFrom(raw);
            if (entry.serviceId !== selectedIdRef.current) return;
            setLogs(current => [...current, entry].slice(-1200));
        });
        const offClear = EventsOn('service:logs-cleared', (payload: {serviceId: string}) => {
            if (payload.serviceId === selectedIdRef.current) setLogs([]);
        });
        return () => { offState(); offServices(); offLog(); offClear(); };
    }, [refreshState]);

    useEffect(() => {
        selectedIdRef.current = selectedId;
        if (!selectedId) { setLogs([]); return; }
        let current = true;
        GetLogs(selectedId)
            .then(entries => { if (current) setLogs(entries ?? []); })
            .catch(error => showToast(errorMessage(error), 'error'));
        return () => { current = false; };
    }, [selectedId, showToast]);

    const loadPrompts = useCallback(async (serviceId: string) => {
        setPromptLoading(true);
        setPromptError('');
        try {
            setPrompts(await GetPrompts(serviceId) ?? []);
        } catch (error) {
            setPrompts([]);
            setPromptError(errorMessage(error));
        } finally {
            setPromptLoading(false);
        }
    }, []);

    useEffect(() => {
        if (rightView !== 'prompts' || !selectedId) return;
        void loadPrompts(selectedId);
    }, [loadPrompts, rightView, selectedId]);

    useEffect(() => {
        const timer = window.setInterval(() => setClock(value => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        let current = true;
        let polling = false;
        const poll = async () => {
            if (polling) return;
            polling = true;
            try {
                const entries = await GetResourceUsage();
                if (!current) return;
                const nextUsage = Object.fromEntries((entries ?? []).map(usage => [usage.serviceId, usage]));
                setResourceUsage(nextUsage);
                setResourceHistory(history => Object.fromEntries((entries ?? []).map(usage => [
                    usage.serviceId,
                    [...(history[usage.serviceId] ?? []), usage].slice(-resourceHistoryLength),
                ])));
            } catch {
                if (current) setResourceUsage({});
            } finally {
                polling = false;
            }
        };
        void poll();
        const timer = window.setInterval(() => void poll(), 2000);
        return () => { current = false; window.clearInterval(timer); };
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
    const checkedServices = useMemo(() => services.filter(service => checkedIds.has(service.id)), [checkedIds, services]);
    const checkedStartableCount = checkedServices.filter(service => !isActive(service) && service.pathExists).length;
    const checkedStoppableCount = checkedServices.filter(isStoppable).length;
    const visibleCheckedCount = filteredServices.filter(service => checkedIds.has(service.id)).length;
    const allVisibleChecked = filteredServices.length > 0 && visibleCheckedCount === filteredServices.length;
    const someVisibleChecked = visibleCheckedCount > 0 && !allVisibleChecked;

    const toggleService = async (service: ServiceView) => {
        if (service.status === 'starting' || service.status === 'stopping') return;
        const starting = !isActive(service);
        setBusyIds(current => new Set(current).add(service.id));
        try {
            if (!starting) {
                await StopService(service.id); showToast(`${service.name} 已停止`);
            } else {
                await StartService(service.id); showToast(`${service.name} 已启动`);
            }
        } catch (error) {
            const message = errorMessage(error);
            if (starting) setOperationIssue({title: `${service.name} 无法启动`, message});
            else showToast(message, 'error');
        } finally {
            setBusyIds(current => { const next = new Set(current); next.delete(service.id); return next; });
            await refreshState();
        }
    };

    const runBatch = async (action: 'start' | 'stop') => {
        setBatchBusy(`all-${action}`);
        try {
            const result = action === 'start' ? await StartAll() : await StopAll();
            const verb = action === 'start' ? '启动' : '停止';
            if ((result.errors ?? []).length > 0) {
                setOperationIssue({title: `部分服务${verb}失败`, message: result.errors.join('\n\n')});
            } else if (result.changed === 0) {
                showToast(action === 'start' ? '所有服务都已在运行' : '当前没有运行中的服务');
            } else {
                showToast(`已${verb} ${result.changed} 个服务`);
            }
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setBatchBusy(null); await refreshState();
        }
    };

    const runSelectedBatch = async (action: 'start' | 'stop') => {
        const ids = checkedServices.map(service => service.id);
        if (ids.length === 0) return;
        setBatchBusy(`selected-${action}`);
        try {
            const result = action === 'start' ? await StartServices(ids) : await StopServices(ids);
            const verb = action === 'start' ? '启动' : '停止';
            if ((result.errors ?? []).length > 0) {
                setOperationIssue({title: `部分选中服务${verb}失败`, message: result.errors.join('\n\n')});
            } else if (result.changed === 0) {
                showToast(action === 'start' ? '选中的服务都已在运行' : '选中的服务均未运行');
            } else {
                showToast(`已${verb} ${result.changed} 个选中服务`);
            }
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setBatchBusy(null); await refreshState();
        }
    };

    const toggleChecked = (id: string) => {
        setCheckedIds(current => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleVisibleSelection = () => {
        setCheckedIds(current => {
            const next = new Set(current);
            if (allVisibleChecked) filteredServices.forEach(service => next.delete(service.id));
            else filteredServices.forEach(service => next.add(service.id));
            return next;
        });
    };

    const openMenu = (event: React.MouseEvent<HTMLButtonElement>, service: ServiceView) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const width = 196, height = 240;
        setMenu({
            service,
            left: Math.min(rect.right - width, window.innerWidth - width - 12),
            top: Math.min(rect.bottom + 5, window.innerHeight - height - 12),
        });
    };

    const revealService = async (service: ServiceView) => {
        setMenu(null);
        try { await RevealService(service.id); }
        catch (error) { showToast(errorMessage(error), 'error'); }
    };

    const openServiceURL = async (service: ServiceView) => {
        if (!service.url) return;
        try { await OpenServiceURL(service.id); }
        catch (error) { showToast(errorMessage(error), 'error'); }
    };

    const openPromptManager = (service: ServiceView) => {
        setMenu(null);
        setPrompts([]);
        setPromptError('');
        setPromptLoading(true);
        setSelectedId(service.id);
        setRightView('prompts');
    };

    const copyCodexPrompt = async (service: ServiceView, prompt: PromptFileView) => {
        setPromptBusy({path: prompt.path, action: 'copy'});
        try {
            await CopyCodexPrompt(service.id, prompt.path);
            showToast(`${prompt.name} 已复制`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptBusy(null);
        }
    };

    const openCodexWithPrompt = async (service: ServiceView, prompt: PromptFileView) => {
        setPromptBusy({path: prompt.path, action: 'open'});
        try {
            await OpenCodexWithPrompt(service.id, prompt.path);
            showToast(`已用 ${prompt.name} 打开 Codex`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptBusy(null);
        }
    };

    const addPrompt = async (service: ServiceView) => {
        setAddingPrompt(true);
        try {
            if (await ChooseAndAddPrompt(service.id)) {
                await loadPrompts(service.id);
                showToast('Prompt 已添加');
            }
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setAddingPrompt(false);
        }
    };

    const syncPrompts = async (service: ServiceView) => {
        setPromptSyncing(true);
        try {
            setPrompts(await GetPrompts(service.id) ?? []);
            setPromptError('');
            showToast('Prompt 已同步');
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptSyncing(false);
        }
    };

    const removePrompt = async (service: ServiceView, prompt: PromptFileView) => {
        setPromptBusy({path: prompt.path, action: 'remove'});
        try {
            await RemovePromptFile(service.id, prompt.path);
            await loadPrompts(service.id);
            showToast(`${prompt.name} 的关联已移除`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptBusy(null);
        }
    };

    const refreshAppState = async () => {
        setRefreshing(true);
        try {
            await refreshState();
            if (selectedId) setLogs((await GetLogs(selectedId)) ?? []);
            showToast('状态已刷新');
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setRefreshing(false);
        }
    };

    const restartService = async (service: ServiceView) => {
        setMenu(null);
        setBusyIds(current => new Set(current).add(service.id));
        try {
            await RestartService(service.id);
            showToast(`${service.name} 已重启`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setBusyIds(current => { const next = new Set(current); next.delete(service.id); return next; });
            await refreshState();
        }
    };

    const confirmClearNextCache = async () => {
        if (!cacheTarget) return;
        const service = cacheTarget;
        setCacheBusyId(service.id);
        try {
            await ClearNextCache(service.id);
            showToast(`${service.name} 的 Next.js 缓存已清除${isActive(service) ? '并重启' : ''}`);
            setCacheTarget(null);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setCacheBusyId('');
            await refreshState();
        }
    };

    const clearSelectedLogs = async () => {
        if (!selectedId) return;
        try { await ClearLogs(selectedId); setLogs([]); }
        catch (error) { showToast(errorMessage(error), 'error'); }
    };

    const downloadSelectedLogs = async () => {
        if (!selectedId || logs.length === 0) return;
        setDownloadingLogs(true);
        try {
            const path = await DownloadLogs(selectedId);
            if (path) showToast(`日志已保存：${path}`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setDownloadingLogs(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await DeleteService(deleteTarget.id);
            showToast(`${deleteTarget.name} 已移除`);
            setDeleteTarget(null); await refreshState();
        } catch (error) { showToast(errorMessage(error), 'error'); }
    };

    return (
        <div className="app-shell">
            <header className="titlebar">
                <label className="search-field titlebar-search">
                    <Search size={16}/>
                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索服务" aria-label="搜索服务"/>
                    {query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" title="清除搜索"><X size={14}/></button>}
                </label>
            </header>

            <div className="toolbar">
                <div className="summary">
                    <Activity size={17}/><span><strong>{services.length}</strong> SERVICES</span>
                    <span className="summary-separator"/><span><strong>{runningCount}</strong> RUNNING</span>
                    <span className="summary-separator"/><span><strong>{readyCount}</strong> READY</span>
                </div>
                <div className="toolbar-actions">
                    <button className={refreshing ? 'icon-button subtle is-pressed' : 'icon-button subtle'} type="button" onClick={() => void refreshAppState()}
                        aria-label="刷新状态" title="刷新状态" disabled={refreshing || batchBusy !== null}>{refreshing ? <RefreshCw className="spin" size={16}/> : <RefreshCw size={16}/>}</button>
                    <button className="button secondary" type="button" onClick={() => void runBatch('stop')} disabled={batchBusy !== null || runningCount === 0}>
                        {batchBusy === 'all-stop' ? <LoaderCircle className="spin" size={16}/> : <Square size={14}/>}全部停止
                    </button>
                    <button className="button primary" type="button" onClick={() => void runBatch('start')} disabled={batchBusy !== null || services.length === 0 || runningCount === services.length}>
                        {batchBusy === 'all-start' ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}全部启动
                    </button>
                    <button className="icon-button add-button" type="button" onClick={() => setDialog({mode: 'create'})} aria-label="添加服务" title="添加服务"><Plus size={19}/></button>
                </div>
            </div>

            <main className="workspace">
                <section className="services-pane" aria-label="服务列表">
                    <div className="pane-heading">
                        <label className="select-all-control">
                            <SelectionCheckbox checked={allVisibleChecked} indeterminate={someVisibleChecked} disabled={batchBusy !== null || filteredServices.length === 0}
                                onChange={toggleVisibleSelection} ariaLabel="选择当前列表中的全部服务"/>
                            <span>服务</span>
                        </label>
                        {checkedIds.size > 0 ? <div className="selection-actions">
                            <span className="selection-count">已选 {checkedIds.size}</span>
                            <button className="selection-action" type="button" onClick={() => void runSelectedBatch('start')}
                                disabled={batchBusy !== null || checkedStartableCount === 0} aria-label="启动选中服务" title="启动选中服务">
                                {batchBusy === 'selected-start' ? <LoaderCircle className="spin" size={14}/> : <Play size={14}/>}
                            </button>
                            <button className="selection-action" type="button" onClick={() => void runSelectedBatch('stop')}
                                disabled={batchBusy !== null || checkedStoppableCount === 0} aria-label="停止选中服务" title="停止选中服务">
                                {batchBusy === 'selected-stop' ? <LoaderCircle className="spin" size={14}/> : <Square size={12}/>}
                            </button>
                            <button className="selection-action" type="button" onClick={() => setCheckedIds(new Set())} disabled={batchBusy !== null}
                                aria-label="清除选择" title="清除选择"><X size={14}/></button>
                        </div> : <span className="service-count">{query ? `${filteredServices.length} / ${services.length}` : services.length}</span>}
                    </div>
                    <div className="services-list">
                        {loading ? (
                            <div className="skeleton-list" aria-label="正在载入服务">
                                {[0, 1, 2].map(item => <div className="skeleton-row" key={item}><span/><span/><span/></div>)}
                            </div>
                        ) : filteredServices.length === 0 ? (
                            <div className="empty-state">
                                <TerminalSquare size={25}/><span>{query ? '没有匹配的服务' : '暂无服务'}</span>
                                {!query && <button className="text-button" type="button" onClick={() => setDialog({mode: 'create'})}>添加服务</button>}
                            </div>
                        ) : filteredServices.map(service => (
                            <ServiceRow key={service.id} service={service} selected={service.id === selectedId} checked={checkedIds.has(service.id)}
                                usage={resourceUsage[service.id]}
                                busy={busyIds.has(service.id) || batchBusy?.startsWith('all') === true || (batchBusy?.startsWith('selected') === true && checkedIds.has(service.id))}
                                onSelect={() => { setSelectedId(service.id); setRightView('logs'); }} onToggle={() => void toggleService(service)}
                                onCheck={() => toggleChecked(service.id)} selectionDisabled={batchBusy !== null}
                                onOpenURL={() => void openServiceURL(service)} onMenu={event => openMenu(event, service)}/>
                        ))}
                    </div>
                </section>

                {rightView === 'prompts' && selectedService ? (
                    <PromptManager service={selectedService} prompts={prompts} loading={promptLoading} error={promptError}
                        adding={addingPrompt} syncing={promptSyncing} busy={promptBusy}
                        onAdd={() => void addPrompt(selectedService)} onRetry={() => void loadPrompts(selectedService.id)}
                        onSync={() => void syncPrompts(selectedService)}
                        onCopy={prompt => void copyCodexPrompt(selectedService, prompt)}
                        onOpen={prompt => void openCodexWithPrompt(selectedService, prompt)}
                        onRemove={prompt => void removePrompt(selectedService, prompt)}
                        onBack={() => setRightView('logs')}/>
                ) : <section className="logs-pane" aria-label="服务日志">
                    <div className="log-heading">
                        <div className="log-title"><TerminalSquare size={17}/><span>{selectedService?.name ?? '日志'}</span>{selectedService && <StatusLabel service={selectedService} compact/>}</div>
                        <div className="log-actions">
                            {selectedService?.url && <button className="log-url" type="button" onClick={() => void openServiceURL(selectedService)} title={`打开 ${selectedService.url}`}>
                                <ExternalLink size={13}/><span>{displayURL(selectedService.url)}</span>
                            </button>}
                            <button className={autoScroll ? 'icon-button subtle is-pressed' : 'icon-button subtle'} type="button" role="switch" aria-checked={autoScroll}
                                onClick={() => setAutoScroll(value => !value)} aria-label="自动跟随日志" title="自动跟随日志" disabled={!selectedService}><ListEnd size={16}/></button>
                            <button className="icon-button subtle" type="button" onClick={() => void downloadSelectedLogs()} aria-label="下载日志" title="下载日志"
                                disabled={!selectedService || logs.length === 0 || downloadingLogs}>{downloadingLogs ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>}</button>
                            <button className="icon-button subtle" type="button" onClick={() => void clearSelectedLogs()} aria-label="清空日志" title="清空日志" disabled={!selectedService || logs.length === 0}><Trash2 size={16}/></button>
                        </div>
                    </div>
                    <ResourceMonitor service={selectedService} usage={selectedUsage} history={selectedResourceHistory}/>
                    <div className="log-viewport" ref={logViewportRef}>
                        {!selectedService ? <div className="console-empty">未选择服务</div>
                            : logs.length === 0 ? <div className="console-empty">暂无日志</div>
                                : <div className="log-lines">{logBlocks.map((entry, index) => (
                                    <LogLine entry={entry} fallbackService={selectedService.name} key={`${entry.timestamp}-${index}`}/>
                                ))}</div>}
                    </div>
                    {selectedService && <div className="console-footer"><span>{selectedService.directory}</span><span>{logs.length} 行</span></div>}
                </section>}
            </main>

            {menu && <>
                <button className="menu-scrim" type="button" onClick={() => setMenu(null)} aria-label="关闭菜单"/>
                <div className="context-menu" role="menu" style={{left: menu.left, top: menu.top}}>
                    <button type="button" role="menuitem" onClick={() => openPromptManager(menu.service)} disabled={!menu.service.pathExists}><MessageSquarePlus size={15}/>Prompt 启动</button>
                    <button type="button" role="menuitem" onClick={() => { setDialog({mode: 'edit', service: menu.service}); setMenu(null); }} disabled={isActive(menu.service)}><Pencil size={15}/>编辑配置</button>
                    <button type="button" role="menuitem" onClick={() => void restartService(menu.service)} disabled={menu.service.status === 'starting' || menu.service.status === 'stopping' || !menu.service.pathExists}><RefreshCw size={15}/>重启服务</button>
                    <button type="button" role="menuitem" onClick={() => { setCacheTarget(menu.service); setMenu(null); }} disabled={cacheBusyId !== '' || menu.service.status === 'starting' || menu.service.status === 'stopping' || !menu.service.pathExists}><Trash2 size={15}/>执行缓存清理</button>
                    <button type="button" role="menuitem" onClick={() => void revealService(menu.service)}><ExternalLink size={15}/>在 Finder 中显示</button>
                    <button className="danger-item" type="button" role="menuitem" onClick={() => { setDeleteTarget(menu.service); setMenu(null); }} disabled={isActive(menu.service)}><Trash2 size={15}/>移除服务</button>
                </div>
            </>}

            {dialog && (
                <ServiceDialog state={dialog} onClose={() => setDialog(null)} onSaved={async service => {
                    setDialog(null); setSelectedId(service.id);
                    showToast(dialog.mode === 'create' ? `${service.name} 已添加` : `${service.name} 已更新`);
                    await refreshState();
                }}/>
            )}

            {deleteTarget && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
                <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
                    <div className="confirm-icon"><Trash2 size={18}/></div><h2 id="delete-title">移除 {deleteTarget.name}？</h2>
                    <p>该操作只删除 LAL 中的配置，不会删除项目文件。</p>
                    <div className="dialog-actions"><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>取消</button><button className="button danger" type="button" onClick={() => void confirmDelete()}>移除</button></div>
                </div>
            </div>}

            {cacheTarget && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !cacheBusyId) setCacheTarget(null); }}>
                <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cache-title">
                    <div className="confirm-icon"><Trash2 size={18}/></div><h2 id="cache-title">执行 {cacheTarget.name} 的缓存清理？</h2>
                    <p>将在项目目录执行以下脚本：</p><pre className="cache-command-preview">{cacheTarget.cleanCommand || defaultCleanCommand}</pre><p>{isActive(cacheTarget) ? '当前服务会先停止，清理后自动重启。' : '当前服务未运行，清理后保持停止。'}</p>
                    <div className="dialog-actions"><button className="button secondary" type="button" onClick={() => setCacheTarget(null)} disabled={Boolean(cacheBusyId)}>取消</button><button className="button danger" type="button" onClick={() => void confirmClearNextCache()} disabled={Boolean(cacheBusyId)}>{cacheBusyId ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={15}/>}清除缓存</button></div>
                </div>
            </div>}

            {operationIssue && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOperationIssue(null); }}>
                <div className="issue-dialog" role="alertdialog" aria-modal="true" aria-labelledby="issue-title">
                    <div className="issue-heading"><span className="issue-icon"><CircleAlert size={18}/></span><h2 id="issue-title">{operationIssue.title}</h2>
                        <button className="icon-button subtle" type="button" onClick={() => setOperationIssue(null)} aria-label="关闭" title="关闭"><X size={18}/></button></div>
                    <pre>{operationIssue.message}</pre>
                    <div className="dialog-actions"><button className="button primary" type="button" onClick={() => setOperationIssue(null)}>知道了</button></div>
                </div>
            </div>}

            {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'error' ? <CircleAlert size={17}/> : <span className="toast-dot"/>}<span>{toast.message}</span></div>}
        </div>
    );
}

function PromptManager({service, prompts, loading, error, adding, syncing, busy, onAdd, onRetry, onSync, onCopy, onOpen, onRemove, onBack}: {
    service: ServiceView;
    prompts: PromptFileView[];
    loading: boolean;
    error: string;
    adding: boolean;
    syncing: boolean;
    busy: {path: string; action: 'copy' | 'open' | 'remove'} | null;
    onAdd: () => void;
    onRetry: () => void;
    onSync: () => void;
    onCopy: (prompt: PromptFileView) => void;
    onOpen: (prompt: PromptFileView) => void;
    onRemove: (prompt: PromptFileView) => void;
    onBack: () => void;
}) {
    return <section className="prompt-pane" aria-label={`${service.name} Prompt 管理`}>
        <div className="prompt-heading">
            <div className="prompt-title"><MessageSquarePlus size={17}/><span>{service.name}</span><span className="prompt-count">{prompts.length} PROMPTS</span></div>
            <div className="prompt-heading-actions">
                <button className="icon-button subtle" type="button" onClick={onSync} disabled={loading || syncing || adding || busy !== null}
                    aria-label="同步 Prompt" title="同步 Prompt">{syncing ? <RefreshCw className="spin" size={16}/> : <RefreshCw size={16}/>}</button>
                <button className="button secondary prompt-add-button" type="button" onClick={onAdd} disabled={adding}>
                    {adding ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>}添加 Prompt
                </button>
                <button className="icon-button subtle" type="button" onClick={onBack} aria-label="返回日志" title="返回日志"><ArrowLeft size={17}/></button>
            </div>
        </div>
        <div className="prompt-viewport">
            {loading ? <div className="prompt-skeleton" aria-label="正在载入 Prompt">
                {[0, 1].map(item => <div className="prompt-skeleton-card" key={item}><span/><span/><span/></div>)}
            </div> : error ? <div className="prompt-state is-error">
                <CircleAlert size={24}/><span>{error}</span>
                <button className="text-button" type="button" onClick={onRetry}>重新载入</button>
            </div> : prompts.length === 0 ? <div className="prompt-state">
                <FileText size={25}/><span>prompts/ 中暂无 Prompt</span>
                <button className="text-button" type="button" onClick={onAdd} disabled={adding}>添加 Prompt</button>
            </div> : <div className="prompt-grid">{prompts.map(prompt => {
                const currentAction = busy?.path === prompt.path ? busy.action : null;
                return <article className={`prompt-card${prompt.error ? ' has-error' : ''}`} key={prompt.path}>
                    <header className="prompt-card-header">
                        <span className="prompt-file-icon"><FileText size={16}/></span>
                        <div className="prompt-card-name"><h3>{prompt.name}</h3><span title={prompt.path}>{prompt.displayPath}</span></div>
                        <span className="prompt-source">{prompt.source === 'project' ? '项目目录' : '外部关联'}</span>
                    </header>
                    {prompt.error ? <div className="prompt-card-error"><CircleAlert size={14}/><span>{prompt.error}</span></div>
                        : <pre className="prompt-preview">{prompt.content}</pre>}
                    <footer className="prompt-card-actions">
                        {prompt.source === 'added' && <button className="icon-button subtle" type="button" onClick={() => onRemove(prompt)}
                            disabled={busy !== null} aria-label={`移除 ${prompt.name} 关联`} title="移除关联">
                            {currentAction === 'remove' ? <LoaderCircle className="spin" size={15}/> : <Unlink size={15}/>}
                        </button>}
                        <span/>
                        <button className="icon-button subtle" type="button" onClick={() => onCopy(prompt)} disabled={busy !== null || Boolean(prompt.error)}
                            aria-label={`复制 ${prompt.name} 内容`} title="复制内容">
                            {currentAction === 'copy' ? <LoaderCircle className="spin" size={15}/> : <Copy size={15}/>}
                        </button>
                        <button className="button primary prompt-launch-button" type="button" onClick={() => onOpen(prompt)} disabled={busy !== null || Boolean(prompt.error)}
                            aria-label={`使用 ${prompt.name} 一键启动`}>
                            {currentAction === 'open' ? <LoaderCircle className="spin" size={15}/> : <MessageSquarePlus size={15}/>}一键启动
                        </button>
                    </footer>
                </article>;
            })}</div>}
        </div>
        <div className="prompt-footer"><span>{service.directory}/prompts</span><span>{prompts.length} 项</span></div>
    </section>;
}

function ServiceRow({service, usage, selected, checked, busy, selectionDisabled, onSelect, onCheck, onToggle, onOpenURL, onMenu}: {
    service: ServiceView; usage?: ResourceUsage; selected: boolean; checked: boolean; busy: boolean; selectionDisabled: boolean;
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
                <ProjectIcon projectType={service.projectType} projectName={service.name}/>
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

function ProjectIcon({projectType, projectName}: {projectType?: string; projectName: string}) {
    const type = projectType || 'generic';
    const label = projectTypeLabels[type] ?? '项目';
    let mark: React.ReactNode = <TerminalSquare size={17}/>;
    if (type === 'nextjs') mark = <NextMark/>;
    else if (type === 'react') mark = <Atom size={17}/>;
    else if (type === 'vite') mark = <Zap size={17}/>;
    else if (type === 'vue' || type === 'svelte' || type === 'angular') mark = <Code2 size={17}/>;
    else if (type === 'go' || type === 'rust') mark = <Box size={17}/>;
    else if (type === 'python' || type === 'node') mark = <Package size={17}/>;
    return <span className={`project-icon project-icon-${type}`} role="img" aria-label={`${projectName}：${label}`} title={label}>{mark}</span>;
}

function NextMark() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="11"/>
        <path d="M7.3 7.2h2.35l5.05 6.35V7.2h2v9.6h-2.2L9.35 10.3v6.5h-2.05z"/>
    </svg>;
}

const projectTypeLabels: Record<string, string> = {
    nextjs: 'Next.js',
    vite: 'Vite',
    react: 'React',
    vue: 'Vue',
    svelte: 'Svelte',
    angular: 'Angular',
    go: 'Go',
    rust: 'Rust',
    python: 'Python',
    node: 'Node.js',
    generic: '本地服务',
};

function ResourceMonitor({service, usage, history}: {service: ServiceView | null; usage?: ResourceUsage; history: ResourceUsage[]}) {
    const cpuValues = history.map(sample => sample.cpuPercent);
    const memoryValues = history.map(sample => sample.memoryBytes);
    const active = service ? isActive(service) : false;
    return <section className="resource-monitor" aria-label={service ? `${service.name} 资源趋势` : '资源趋势'}>
        <div className="resource-identity">
            <span className="resource-kicker">TELEMETRY</span>
            <span className={active ? 'resource-live is-active' : 'resource-live'}><span/>{active ? 'LIVE' : 'IDLE'}</span>
            <span className="resource-processes">PROC {usage?.processCount ?? 0}</span>
            <span className="resource-window">120 SEC</span>
        </div>
        <TrendMetric label="CPU" value={usage?.cpuPercent ?? 0} values={cpuValues} kind="cpu"/>
        <TrendMetric label="RSS" value={usage?.memoryBytes ?? 0} values={memoryValues} kind="memory"/>
    </section>;
}

function TrendMetric({label, value, values, kind}: {label: string; value: number; values: number[]; kind: 'cpu' | 'memory'}) {
    const scale = kind === 'cpu' ? cpuScale(values) : memoryScale(values);
    const chartValues = values.length === 1 ? [values[0], values[0]] : values;
    const points = chartValues.map((point, index) => {
        const x = chartValues.length <= 1 ? 240 : index * 240 / (chartValues.length - 1);
        const y = 45 - Math.min(point / scale, 1) * 39;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const currentPoint = points.split(' ').at(-1)?.split(',') ?? ['240', '45'];
    const formattedValue = kind === 'cpu' ? formatCPU(value) : formatMemory(value);
    const formattedScale = kind === 'cpu' ? formatCPU(scale) : formatMemory(scale);
    return <div className={`trend-metric is-${kind}`}>
        <div className="trend-heading"><span>{label}</span><strong>{formattedValue}</strong><small>CEIL {formattedScale}</small></div>
        <svg className="trend-chart" viewBox="0 0 240 50" preserveAspectRatio="none" role="img" aria-label={`${label} 当前 ${formattedValue}`}>
            <g className="trend-grid"><line x1="0" y1="12" x2="240" y2="12"/><line x1="0" y1="25" x2="240" y2="25"/><line x1="0" y1="38" x2="240" y2="38"/><line x1="60" y1="0" x2="60" y2="50"/><line x1="120" y1="0" x2="120" y2="50"/><line x1="180" y1="0" x2="180" y2="50"/></g>
            {points && <polyline className="trend-line" points={points}/>}
            {points && <circle className="trend-point" cx={currentPoint[0]} cy={currentPoint[1]} r="2.2"/>}
        </svg>
    </div>;
}

function SelectionCheckbox({checked, indeterminate, disabled, onChange, ariaLabel}: {
    checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void; ariaLabel: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate; }, [indeterminate]);
    return <input ref={inputRef} className="selection-checkbox" type="checkbox" checked={checked} disabled={disabled}
        onChange={onChange} aria-label={ariaLabel}/>;
}

function StatusLabel({service, compact = false}: {service: ServiceView; compact?: boolean}) {
    let state = serviceVisualState(service);
    let label = ({running: '运行中', starting: '启动中', stopping: '停止中', failed: '异常', stopped: '已停止', invalid: '路径失效'} as Record<string, string>)[state] ?? '已停止';
    if (state === 'ready') label = '可访问';
    if (state === 'checking') label = '等待端口';
    if (state === 'unreachable') label = '地址不可达';
    return <span className={`status-label state-${state} ${compact ? 'is-compact' : ''}`} title={service.healthInfo || label}><span className="status-dot"/>{label}</span>;
}

function serviceVisualState(service: ServiceView) {
    if (!service.pathExists) return 'invalid';
    if (service.status === 'running' && service.url && ['ready', 'checking', 'unreachable'].includes(service.health)) return service.health;
    return service.status;
}

function ServiceDialog({state, onClose, onSaved}: {state: DialogState; onClose: () => void; onSaved: (service: ServiceView) => Promise<void>}) {
    const initial = state.mode === 'edit' ? {name: state.service.name, directory: state.service.directory, command: state.service.command, url: state.service.url ?? '', cleanCommand: state.service.cleanCommand ?? defaultCleanCommand} : emptyForm;
    const [form, setForm] = useState<ServiceForm>(initial);
    const [saving, setSaving] = useState(false);
    const [browsing, setBrowsing] = useState(false);
    const [error, setError] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => nameInputRef.current?.focus(), []);

    const browse = async () => {
        setBrowsing(true); setError('');
        try {
            let directory: string;
            try { directory = await ChooseDirectory(form.directory); }
            catch { directory = await ChooseDirectory(''); }
            if (directory) setForm(current => ({...current, directory}));
        } catch (browseError) { setError(errorMessage(browseError)); }
        finally { setBrowsing(false); }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const normalized = {name: form.name.trim(), directory: form.directory.trim(), command: form.command.trim(), url: form.url.trim(), cleanCommand: form.cleanCommand.trim()};
        if (state.mode === 'edit' && normalized.name === initial.name && normalized.directory === initial.directory && normalized.command === initial.command && normalized.url === initial.url && normalized.cleanCommand === initial.cleanCommand) { onClose(); return; }
        setSaving(true); setError('');
        try {
            const service = state.mode === 'create' ? await CreateService(normalized) : await UpdateService(state.service.id, normalized);
            await onSaved(service);
        } catch (saveError) { setError(errorMessage(saveError)); setSaving(false); }
    };

    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <form className="service-dialog" onSubmit={event => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="service-dialog-title">
            <div className="dialog-heading"><h2 id="service-dialog-title">{state.mode === 'create' ? '添加本地服务' : '编辑服务'}</h2>
                <button className="icon-button subtle" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={18}/></button></div>
            <div className="form-fields">
                <label><span>服务名称</span><input ref={nameInputRef} value={form.name} onChange={event => setForm({...form, name: event.target.value})} maxLength={80} required placeholder="例如 myStock"/></label>
                <label><span>项目目录</span><div className="input-with-action"><input value={form.directory} onChange={event => setForm({...form, directory: event.target.value})} required placeholder="/Users/name/path/to/project" spellCheck={false}/>
                    <button type="button" onClick={() => void browse()} aria-label="选择目录" title="选择目录" disabled={browsing}>{browsing ? <LoaderCircle className="spin" size={17}/> : <FolderOpen size={17}/>} </button></div></label>
                <label><span>启动命令</span><input className="command-input" value={form.command} onChange={event => setForm({...form, command: event.target.value})} required maxLength={1000} placeholder="npm run dev" spellCheck={false}/></label>
                <label><span>访问地址 <small>可选</small></span><input className="command-input" value={form.url} onChange={event => setForm({...form, url: event.target.value})} maxLength={500} inputMode="url" placeholder="http://localhost:3900" spellCheck={false}/></label>
                <label><span>缓存清理脚本 <small>在项目目录执行</small></span><textarea className="command-input cache-command-input" value={form.cleanCommand} onChange={event => setForm({...form, cleanCommand: event.target.value})} required maxLength={2000} rows={2} placeholder="rm -rf .next" spellCheck={false}/></label>
            </div>
            {error && <div className="form-error"><CircleAlert size={15}/><span>{error}</span></div>}
            <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={16}/>} {state.mode === 'create' ? '添加服务' : '保存'}</button></div>
        </form>
    </div>;
}

function isActive(service: ServiceView) {
    return service.status === 'running' || service.status === 'starting' || service.status === 'stopping';
}

function isStoppable(service: ServiceView) {
    return service.status === 'running' || service.status === 'starting';
}

function formatUptime(startedAt: string) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

function formatCPU(value: number) {
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatMemory(bytes: number) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function cpuScale(values: number[]) {
    return Math.max(100, Math.ceil(Math.max(0, ...values) / 100) * 100);
}

function memoryScale(values: number[]) {
    const step = 128 * 1024 ** 2;
    return Math.max(256 * 1024 ** 2, Math.ceil(Math.max(0, ...values) / step) * step);
}

function displayURL(value: string) {
    return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function errorMessage(error: unknown) {
    if (typeof error === 'string') return error;
    if (error instanceof Error && error.message) return error.message;
    return '操作失败';
}

export default App;
