import {requestPortAction} from './usePortActions';
import type {Dispatch, SetStateAction} from 'react';
import {
    ClearLogs,
    ClearNextCache,
    DeleteService,
    DownloadLogs,
    GetLogs,
    OpenServiceURL,
    RevealService,
    RestartService,
    RunPackageScript,
    StartAll,
    StartServices,
    StartService,
    SetGameLaunchMode,
    StopAll,
    StopPackageScript,
    StopService,
    StopServices,
} from '../../wailsjs/lal/app';
import type {BatchBusyState, DialogState, LogEntry, MenuState, OperationIssue, ServiceView} from '../types';
import {errorMessage, isActive} from '../utils';

type ServiceActionContext = {
    selectedId: string;
    onSelectService: (id: string) => void;
    logs: LogEntry[];
    checkedServices: ServiceView[];
    filteredServices: ServiceView[];
    allVisibleChecked: boolean;
    cacheTarget: ServiceView | null;
    deleteTarget: ServiceView | null;
    refreshState: (forceIconRefresh?: boolean) => Promise<void>;
    showToast: (message: string, kind?: 'success' | 'error') => void;
    setBusyIds: Dispatch<SetStateAction<Set<string>>>;
    setBatchBusy: Dispatch<SetStateAction<BatchBusyState>>;
    setOperationIssue: Dispatch<SetStateAction<OperationIssue | null>>;
    setMenu: Dispatch<SetStateAction<MenuState | null>>;
    setDialog: Dispatch<SetStateAction<DialogState | null>>;
    setDeleteTarget: Dispatch<SetStateAction<ServiceView | null>>;
    setCacheTarget: Dispatch<SetStateAction<ServiceView | null>>;
    setCacheBusyId: Dispatch<SetStateAction<string>>;
    setScriptBusyId: Dispatch<SetStateAction<string>>;
    setCheckedIds: Dispatch<SetStateAction<Set<string>>>;
    setLogs: Dispatch<SetStateAction<LogEntry[]>>;
    setRefreshing: Dispatch<SetStateAction<boolean>>;
    setDownloadingLogs: Dispatch<SetStateAction<boolean>>;
};

export function useServiceActions(context: ServiceActionContext) {
    const {selectedId, logs, checkedServices, filteredServices, allVisibleChecked, cacheTarget, deleteTarget,
        refreshState, showToast, setBusyIds, setBatchBusy, setOperationIssue, setMenu, setDialog, setDeleteTarget,
        setCacheTarget, setCacheBusyId, setScriptBusyId, setCheckedIds, setLogs, setRefreshing, setDownloadingLogs} = context;

    const handlePort = (service: ServiceView) => requestPortAction(service, setOperationIssue,
        () => setDialog({mode: 'edit', service}), refreshState, showToast);

    const toggleService = async (service: ServiceView) => {
        const starting = !isActive(service);
        if (starting) context.onSelectService(service.id);
        if (handlePort(service)) return;
        if (service.status === 'starting' || service.status === 'stopping') return;
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

    const changeGameMode = async (service: ServiceView, mode: 'release' | 'debug') => {
        if (mode === 'release' && !service.releaseCommand?.trim()) { setDialog({mode: 'edit', service}); return; }
        setBusyIds(current => new Set(current).add(service.id));
        try { await SetGameLaunchMode(service.id, mode); }
        catch (error) { showToast(errorMessage(error), 'error'); }
        finally {
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
        const width = 196, height = 280;
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

    const runPackageScript = async (service: ServiceView, scriptName: string) => {
        setScriptBusyId(service.id);
        try {
            await RunPackageScript(service.id, scriptName);
            showToast(`${service.name} 的 npm 脚本已启动`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setScriptBusyId('');
            await refreshState();
        }
    };

    const stopPackageScript = async (service: ServiceView) => {
        setScriptBusyId(service.id);
        try {
            await StopPackageScript(service.id);
            showToast(`${service.name} 的 npm 脚本已停止`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setScriptBusyId('');
            await refreshState();
        }
    };

    const refreshAppState = async () => {
        setRefreshing(true);
        try {
            await refreshState(true);
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
        if (handlePort(service)) return;
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

    return {
        toggleService, changeGameMode, runBatch, runSelectedBatch, toggleChecked, toggleVisibleSelection, openMenu,
        revealService, openServiceURL, runPackageScript, stopPackageScript, refreshAppState,
        restartService, confirmClearNextCache, clearSelectedLogs, downloadSelectedLogs, confirmDelete,
    };
}
