import {useCallback, useEffect, useRef, useState} from 'react';
import {GetNetworkInfo} from '../../wailsjs/lal/app';
import type {NetworkSnapshot} from '../types';
import {errorMessage} from '../utils';

export function useNetworkInfo() {
    const [data, setData] = useState<NetworkSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const mounted = useRef(false);
    const pending = useRef(false);

    const refresh = useCallback(async () => {
        if (pending.current) return;
        pending.current = true;
        setLoading(true);
        try {
            const result = await GetNetworkInfo();
            if (mounted.current) { setData(result); setError(''); }
        } catch (error) {
            if (mounted.current) setError(errorMessage(error));
        } finally {
            pending.current = false;
            if (mounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        void refresh();
        const refreshVisible = () => { if (!document.hidden) void refresh(); };
        const timer = window.setInterval(refreshVisible, 15_000);
        window.addEventListener('focus', refreshVisible);
        document.addEventListener('visibilitychange', refreshVisible);
        return () => {
            mounted.current = false;
            window.clearInterval(timer);
            window.removeEventListener('focus', refreshVisible);
            document.removeEventListener('visibilitychange', refreshVisible);
        };
    }, [refresh]);

    return {data, loading, error, refresh};
}

export type NetworkState = ReturnType<typeof useNetworkInfo>;
