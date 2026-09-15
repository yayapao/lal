import {useEffect, useState} from 'react';
import {GetServiceIcon} from '../../wailsjs/go/main/App';
import type {ServiceView} from '../types';

export function useServiceIcons(services: ServiceView[]) {
    const [iconURLs, setIconURLs] = useState<Record<string, string>>({});

    useEffect(() => {
        let cancelled = false;
        const missing = services.filter(service => service.iconPath && iconURLs[service.id] === undefined);
        if (missing.length === 0) return;
        void Promise.all(missing.map(async service => {
            try { return [service.id, await GetServiceIcon(service.id)] as const; }
            catch { return [service.id, ''] as const; }
        })).then(entries => {
            if (cancelled) return;
            setIconURLs(current => ({...current, ...Object.fromEntries(entries)}));
        });
        return () => { cancelled = true; };
    }, [iconURLs, services]);

    return iconURLs;
}
