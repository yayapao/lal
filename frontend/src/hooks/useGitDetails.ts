import {useEffect, useRef, useState} from 'react';
import {GetServiceGitDetails} from '../../wailsjs/lal/app';
import type {GitDetails, GitStatus, ServiceView} from '../types';
import {errorMessage} from '../utils';

export function useGitDetails(service: ServiceView, refreshKey: number, onStatus: (status: GitStatus) => void, paused = false) {
    const {id, directory} = service;
    const [details, setDetails] = useState<GitDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const refreshRef = useRef<() => Promise<void>>(async () => undefined);
    const identityRef = useRef('');
    const pausedRef = useRef(paused);
    pausedRef.current = paused;

    useEffect(() => {
        let cancelled = false;
        let request: Promise<void> | undefined;
        const identity = JSON.stringify([id, directory]);
        if (identityRef.current !== identity) {
            identityRef.current = identity;
            setDetails(null);
            setError('');
        }
        if (pausedRef.current) setLoading(false);
        const load = (force = false): Promise<void> => {
            if (cancelled || (!force && pausedRef.current)) return Promise.resolve();
            if (request) return force ? request.then(() => load(true)) : request;
            setLoading(true);
            request = (async () => {
                try {
                    const next = await GetServiceGitDetails(id);
                    if (cancelled || (!force && pausedRef.current)) return;
                    if (next.status.serviceId !== id || next.status.directory !== directory) throw new Error('项目目录已变化，请重新刷新');
                    setDetails(next);
                    setError('');
                    onStatus(next.status);
                } catch (error) {
                    if (!cancelled && (force || !pausedRef.current)) setError(errorMessage(error));
                } finally {
                    request = undefined;
                    if (!cancelled) setLoading(false);
                }
            })();
            return request;
        };
        refreshRef.current = () => load(true);
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
