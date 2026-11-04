import {useEffect, useRef, useState} from 'react';
import {GetServiceIcon} from '../../wailsjs/lal/app';
import type {ServiceView} from '../types';

type CachedIcon = {key: string; url: string};

export function useServiceIcons(services: ServiceView[], refreshKey = 0) {
    const [iconURLs, setIconURLs] = useState<Record<string, string>>({});
    const cache = useRef<Record<string, CachedIcon>>({});

    useEffect(() => {
        let cancelled = false;
        void Promise.all(services.filter(service => service.iconPath).map(async service => {
            const key = JSON.stringify([service.directory, service.iconPath, service.iconVersion, refreshKey]);
            const cached = cache.current[service.id];
            if (cached?.key === key && cached.url) return [service.id, cached] as const;
            try { return [service.id, {key, url: await GetServiceIcon(service.id)}] as const; }
            catch { return [service.id, {key, url: ''}] as const; }
        })).then(entries => {
            if (cancelled) return;
            cache.current = Object.fromEntries(entries);
            setIconURLs(Object.fromEntries(entries.map(([id, icon]) => [id, icon.url])));
        });
        return () => { cancelled = true; };
    }, [refreshKey, services]);

    return iconURLs;
}
