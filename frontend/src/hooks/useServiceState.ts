import {useCallback, useEffect, useRef, useState} from 'react';
import {GetAppState, GetLogs} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';
import {EventsOn} from '../../wailsjs/runtime/runtime';
import type {LogEntry, ServiceView} from '../types';
import {errorMessage} from '../utils';

export function useServiceState(showToast: (message: string, kind?: 'success' | 'error') => void) {
    const [services, setServices] = useState<ServiceView[]>([]);
    const [workspaces, setWorkspaces] = useState<string[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [iconRefreshKey, setIconRefreshKey] = useState(0);
    const selectedIdRef = useRef('');

    const refreshState = useCallback(async (forceIconRefresh = false) => {
        try {
            const state = await GetAppState();
            const nextServices = state.services ?? [];
            setServices(nextServices);
            setWorkspaces([...new Set([...(state.workspaces ?? []), ...nextServices.map(service => service.workspace ?? '').filter(Boolean)])]);
            if (forceIconRefresh) setIconRefreshKey(current => current + 1);
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

    return {services, workspaces, selectedId, setSelectedId, checkedIds, setCheckedIds, logs, setLogs, loading, refreshState, iconRefreshKey};
}
