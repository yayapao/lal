import {useEffect, useState} from 'react';
import {GetResourceUsage} from '../../wailsjs/lal/app';
import {resourceHistoryLength} from '../types';
import type {ResourceUsage} from '../types';

export function useResourceUsage() {
    const [resourceUsage, setResourceUsage] = useState<Record<string, ResourceUsage>>({});
    const [resourceHistory, setResourceHistory] = useState<Record<string, ResourceUsage[]>>({});

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

    return {resourceUsage, resourceHistory};
}
