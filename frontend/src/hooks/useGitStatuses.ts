import {useCallback, useEffect, useState} from 'react';
import {GetGitStatuses} from '../../wailsjs/lal/app';
import * as main from '../../wailsjs/lal/internal/launcher/models';
import type {GitStatus, ServiceView} from '../types';
import {errorMessage} from '../utils';

export function useGitStatuses(services: ServiceView[], refreshKey = 0) {
    const key = JSON.stringify(services.map(({id, directory}) => ({id, directory})));
    const [snapshot, setSnapshot] = useState<{key: string; statuses: Record<string, GitStatus>}>({key: '', statuses: {}});

    useEffect(() => {
        const projects = JSON.parse(key) as {id: string; directory: string}[];
        let cancelled = false;
        let inFlight = false;
        const load = async () => {
            if (inFlight || projects.length === 0) return;
            inFlight = true;
            try {
                const entries = (await GetGitStatuses()) ?? [];
                if (cancelled) return;
                const statuses: Record<string, GitStatus> = {};
                for (const project of projects) {
                    const status = entries.find(entry => entry.serviceId === project.id && entry.directory === project.directory);
                    statuses[project.id] = status ?? main.GitStatus.createFrom({
                        serviceId: project.id, directory: project.directory, state: 'error', error: '未获取 Git 状态，请刷新重试',
                    });
                }
                setSnapshot({key, statuses});
            } catch (error) {
                if (cancelled) return;
                setSnapshot({key, statuses: Object.fromEntries(projects.map(project => [project.id, main.GitStatus.createFrom({
                    serviceId: project.id, directory: project.directory, state: 'error', error: errorMessage(error),
                })]))});
            } finally { inFlight = false; }
        };
        void load();
        const onVisible = () => { if (!document.hidden) void load(); };
        const timer = window.setInterval(onVisible, 15000);
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener('focus', onVisible);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [key, refreshKey]);

    const update = useCallback((status: GitStatus) => {
        const projects = JSON.parse(key) as {id: string; directory: string}[];
        if (!projects.some(project => project.id === status.serviceId && project.directory === status.directory)) return;
        setSnapshot(current => ({key, statuses: {...(current.key === key ? current.statuses : {}), [status.serviceId]: status}}));
    }, [key]);

    return {statuses: snapshot.key === key ? snapshot.statuses : {}, update};
}
