import {useEffect, useRef, useState} from 'react';
import {GetServiceGitDetails} from '../../wailsjs/go/main/App';
import type {GitDetails, GitStatus, ServiceView} from '../types';
import {errorMessage} from '../utils';

export function useGitDetails(service: ServiceView, refreshKey: number, onStatus: (status: GitStatus) => void) {
    const {id, directory} = service;
    const [details, setDetails] = useState<GitDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const refreshRef = useRef<() => Promise<void>>(async () => undefined);

    useEffect(() => {
        let cancelled = false;
        let inFlight = false;
        setDetails(null);
        setError('');
        const load = async () => {
            if (inFlight) return;
            inFlight = true;
            setLoading(true);
            try {
                const next = await GetServiceGitDetails(id);
                if (cancelled) return;
                if (next.status.serviceId !== id || next.status.directory !== directory) throw new Error('项目目录已变化，请重新刷新');
                setDetails(next);
                setError('');
                onStatus(next.status);
            } catch (error) {
                if (!cancelled) { setDetails(null); setError(errorMessage(error)); }
            } finally {
                inFlight = false;
                if (!cancelled) setLoading(false);
            }
        };
        refreshRef.current = load;
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
    }, [directory, id, onStatus, refreshKey]);

    return {details, loading, error, refresh: () => refreshRef.current()};
}
