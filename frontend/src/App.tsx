import {
    Activity,
    ArrowDownToLine,
    CircleAlert,
    Ellipsis,
    ExternalLink,
    FolderOpen,
    LoaderCircle,
    Pencil,
    Play,
    Plus,
    Search,
    Square,
    TerminalSquare,
    Trash2,
    X,
} from 'lucide-react';
import {FormEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import './App.css';
import {
    ChooseDirectory,
    ClearLogs,
    CreateService,
    DeleteService,
    GetAppState,
    GetLogs,
    RevealService,
    StartAll,
    StartService,
    StopAll,
    StopService,
    UpdateService,
} from '../wailsjs/go/main/App';
import {main} from '../wailsjs/go/models';
import {EventsOn} from '../wailsjs/runtime/runtime';

type ServiceView = main.ServiceView;
type LogEntry = main.LogEntry;
type DialogState = {mode: 'create'} | {mode: 'edit'; service: ServiceView};
type ServiceForm = {name: string; directory: string; command: string};
type ToastState = {kind: 'success' | 'error'; message: string};
type MenuState = {service: ServiceView; left: number; top: number};

const emptyForm: ServiceForm = {name: '', directory: '', command: 'npm run dev'};
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function App() {
    const [services, setServices] = useState<ServiceView[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
    const [batchBusy, setBatchBusy] = useState<'start' | 'stop' | null>(null);
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ServiceView | null>(null);
    const [menu, setMenu] = useState<MenuState | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
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

    useEffect(() => {
        const timer = window.setInterval(() => setClock(value => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setMenu(null); setDialog(null); setDeleteTarget(null);
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
    const runningCount = services.filter(isActive).length;
    const filteredServices = useMemo(() => {
        const keyword = query.trim().toLocaleLowerCase();
        if (!keyword) return services;
        return services.filter(service => [service.name, service.directory, service.command]
            .some(value => value.toLocaleLowerCase().includes(keyword)));
    }, [query, services]);

    const toggleService = async (service: ServiceView) => {
        if (service.status === 'starting' || service.status === 'stopping') return;
        setBusyIds(current => new Set(current).add(service.id));
        try {
            if (isActive(service)) {
                await StopService(service.id); showToast(`${service.name} 已停止`);
            } else {
                await StartService(service.id); showToast(`${service.name} 已启动`);
            }
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setBusyIds(current => { const next = new Set(current); next.delete(service.id); return next; });
            await refreshState();
        }
    };

    const runBatch = async (action: 'start' | 'stop') => {
        setBatchBusy(action);
        try {
            const result = action === 'start' ? await StartAll() : await StopAll();
            const verb = action === 'start' ? '启动' : '停止';
            if ((result.errors ?? []).length > 0) {
                showToast(`${verb}完成 ${result.changed} 个，${result.errors.length} 个失败：${result.errors[0]}`, 'error');
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

    const openMenu = (event: React.MouseEvent<HTMLButtonElement>, service: ServiceView) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const width = 176, height = 132;
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

    const clearSelectedLogs = async () => {
        if (!selectedId) return;
        try { await ClearLogs(selectedId); setLogs([]); }
        catch (error) { showToast(errorMessage(error), 'error'); }
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
                <div className="brand-mark" aria-hidden="true"><TerminalSquare size={18}/></div>
                <div className="brand-name">LAL</div>
                <div className="brand-subtitle">Local App Launcher</div>
                <div className="titlebar-status"><span className={runningCount > 0 ? 'live-pulse is-active' : 'live-pulse'}/>{runningCount} 个运行中</div>
            </header>

            <div className="toolbar">
                <div className="summary">
                    <Activity size={17}/><span><strong>{services.length}</strong> 个服务</span>
                    <span className="summary-separator"/><span><strong>{runningCount}</strong> 个运行中</span>
                </div>
                <label className="search-field">
                    <Search size={16}/>
                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索服务" aria-label="搜索服务"/>
                    {query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" title="清除搜索"><X size={14}/></button>}
                </label>
                <div className="toolbar-actions">
                    <button className="button secondary" type="button" onClick={() => void runBatch('stop')} disabled={batchBusy !== null || runningCount === 0}>
                        {batchBusy === 'stop' ? <LoaderCircle className="spin" size={16}/> : <Square size={14}/>}全部停止
                    </button>
                    <button className="button primary" type="button" onClick={() => void runBatch('start')} disabled={batchBusy !== null || services.length === 0 || runningCount === services.length}>
                        {batchBusy === 'start' ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}全部启动
                    </button>
                    <button className="icon-button add-button" type="button" onClick={() => setDialog({mode: 'create'})} aria-label="添加服务" title="添加服务"><Plus size={19}/></button>
                </div>
            </div>

            <main className="workspace">
                <section className="services-pane" aria-label="服务列表">
                    <div className="pane-heading"><span>服务</span><span>{query ? `${filteredServices.length} / ${services.length}` : services.length}</span></div>
                    <div className="services-list">
                        {loading ? (
                            <div className="empty-state"><LoaderCircle className="spin" size={22}/><span>正在载入</span></div>
                        ) : filteredServices.length === 0 ? (
                            <div className="empty-state">
                                <TerminalSquare size={25}/><span>{query ? '没有匹配的服务' : '暂无服务'}</span>
                                {!query && <button className="text-button" type="button" onClick={() => setDialog({mode: 'create'})}>添加服务</button>}
                            </div>
                        ) : filteredServices.map(service => (
                            <ServiceRow key={service.id} service={service} selected={service.id === selectedId} busy={busyIds.has(service.id)}
                                onSelect={() => setSelectedId(service.id)} onToggle={() => void toggleService(service)} onMenu={event => openMenu(event, service)}/>
                        ))}
                    </div>
                </section>

                <section className="logs-pane" aria-label="服务日志">
                    <div className="log-heading">
                        <div className="log-title"><TerminalSquare size={17}/><span>{selectedService?.name ?? '日志'}</span>{selectedService && <StatusLabel service={selectedService} compact/>}</div>
                        <div className="log-actions">
                            <button className={autoScroll ? 'icon-button subtle is-pressed' : 'icon-button subtle'} type="button" role="switch" aria-checked={autoScroll}
                                onClick={() => setAutoScroll(value => !value)} aria-label="自动跟随日志" title="自动跟随日志" disabled={!selectedService}><ArrowDownToLine size={16}/></button>
                            <button className="icon-button subtle" type="button" onClick={() => void clearSelectedLogs()} aria-label="清空日志" title="清空日志" disabled={!selectedService || logs.length === 0}><Trash2 size={16}/></button>
                        </div>
                    </div>
                    <div className="log-viewport" ref={logViewportRef}>
                        {!selectedService ? <div className="console-empty">未选择服务</div>
                            : logs.length === 0 ? <div className="console-empty">暂无日志</div>
                                : <div className="log-lines">{logs.map((entry, index) => (
                                    <div className={`log-line stream-${entry.stream}`} key={`${entry.timestamp}-${index}`}>
                                        <time>{formatLogTime(entry.timestamp)}</time>
                                        <span className="stream-mark">{entry.stream === 'stderr' ? 'ERR' : entry.stream === 'system' ? 'LAL' : 'OUT'}</span>
                                        <span className="log-text">{entry.text || ' '}</span>
                                    </div>
                                ))}</div>}
                    </div>
                    {selectedService && <div className="console-footer"><span>{selectedService.directory}</span><span>{logs.length} 行</span></div>}
                </section>
            </main>

            {menu && <>
                <button className="menu-scrim" type="button" onClick={() => setMenu(null)} aria-label="关闭菜单"/>
                <div className="context-menu" role="menu" style={{left: menu.left, top: menu.top}}>
                    <button type="button" role="menuitem" onClick={() => { setDialog({mode: 'edit', service: menu.service}); setMenu(null); }} disabled={isActive(menu.service)}><Pencil size={15}/>编辑配置</button>
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

            {toast && <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'error' ? <CircleAlert size={17}/> : <span className="toast-dot"/>}<span>{toast.message}</span></div>}
        </div>
    );
}

function ServiceRow({service, selected, busy, onSelect, onToggle, onMenu}: {
    service: ServiceView; selected: boolean; busy: boolean; onSelect: () => void; onToggle: () => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
    const transition = service.status === 'starting' || service.status === 'stopping';
    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); }
    };
    return (
        <article className={selected ? 'service-row is-selected' : 'service-row'} onClick={onSelect} onKeyDown={handleKeyDown} tabIndex={0} aria-current={selected}>
            <span className={`service-accent status-${service.status}`}/>
            <div className="service-copy">
                <div className="service-name-line"><h3>{service.name}</h3>{service.pid > 0 && <span className="pid">PID {service.pid}</span>}{service.startedAt && isActive(service) && <span className="uptime">{formatUptime(service.startedAt)}</span>}</div>
                <div className={service.pathExists ? 'service-path' : 'service-path path-invalid'} title={service.directory}>{!service.pathExists && <CircleAlert size={12}/>}<span>{service.directory}</span></div>
                <code className="service-command" title={service.command}>{service.command}</code>
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

function StatusLabel({service, compact = false}: {service: ServiceView; compact?: boolean}) {
    const label = !service.pathExists ? '路径失效' : ({running: '运行中', starting: '启动中', stopping: '停止中', failed: '异常', stopped: '已停止'} as Record<string, string>)[service.status] ?? '已停止';
    return <span className={`status-label status-${!service.pathExists ? 'invalid' : service.status} ${compact ? 'is-compact' : ''}`}><span className="status-dot"/>{label}</span>;
}

function ServiceDialog({state, onClose, onSaved}: {state: DialogState; onClose: () => void; onSaved: (service: ServiceView) => Promise<void>}) {
    const initial = state.mode === 'edit' ? {name: state.service.name, directory: state.service.directory, command: state.service.command} : emptyForm;
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
        const normalized = {name: form.name.trim(), directory: form.directory.trim(), command: form.command.trim()};
        if (state.mode === 'edit' && normalized.name === initial.name && normalized.directory === initial.directory && normalized.command === initial.command) { onClose(); return; }
        setSaving(true); setError('');
        try {
            const service = state.mode === 'create' ? await CreateService(normalized) : await UpdateService(state.service.id, normalized);
            await onSaved(service);
        } catch (saveError) { setError(errorMessage(saveError)); setSaving(false); }
    };

    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <form className="service-dialog" onSubmit={event => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="service-dialog-title">
            <div className="dialog-heading"><div><span className="dialog-kicker">SERVICE CONFIG</span><h2 id="service-dialog-title">{state.mode === 'create' ? '添加本地服务' : '编辑服务'}</h2></div>
                <button className="icon-button subtle" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={18}/></button></div>
            <div className="form-fields">
                <label><span>服务名称</span><input ref={nameInputRef} value={form.name} onChange={event => setForm({...form, name: event.target.value})} maxLength={80} required placeholder="例如 myStock"/></label>
                <label><span>项目目录</span><div className="input-with-action"><input value={form.directory} onChange={event => setForm({...form, directory: event.target.value})} required placeholder="/Users/name/path/to/project" spellCheck={false}/>
                    <button type="button" onClick={() => void browse()} aria-label="选择目录" title="选择目录" disabled={browsing}>{browsing ? <LoaderCircle className="spin" size={17}/> : <FolderOpen size={17}/>} </button></div></label>
                <label><span>启动命令</span><input className="command-input" value={form.command} onChange={event => setForm({...form, command: event.target.value})} required maxLength={1000} placeholder="npm run dev" spellCheck={false}/></label>
            </div>
            {error && <div className="form-error"><CircleAlert size={15}/><span>{error}</span></div>}
            <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={16}/>} {state.mode === 'create' ? '添加服务' : '保存'}</button></div>
        </form>
    </div>;
}

function isActive(service: ServiceView) {
    return service.status === 'running' || service.status === 'starting' || service.status === 'stopping';
}

function formatLogTime(timestamp: string) {
    const time = new Date(timestamp);
    return Number.isNaN(time.getTime()) ? '--:--:--' : timeFormatter.format(time);
}

function formatUptime(startedAt: string) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

function errorMessage(error: unknown) {
    if (typeof error === 'string') return error;
    if (error instanceof Error && error.message) return error.message;
    return '操作失败';
}

export default App;
