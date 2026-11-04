import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import {api, alphaService} from '../testApi';
import {useServiceState} from './useServiceState';

const events = vi.hoisted(() => new Map<string, (event: {data: unknown}) => void>());
const unsubscribed = vi.hoisted(() => vi.fn());
vi.mock('../../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({
    ...await importOriginal<typeof import('@wailsio/runtime')>(),
    Events: {On: vi.fn((name: string, callback: (event: {data: unknown}) => void) => {
        events.set(name, callback);
        return () => { events.delete(name); unsubscribed(name); };
    })},
}));

beforeEach(() => {
    vi.clearAllMocks();
    api.GetAppState.mockResolvedValue({services: [alphaService], workspaces: [], warning: ''});
    api.GetLogs.mockResolvedValue([]);
    events.clear();
});

it('uses v3 event.data for live logs, ignores other services and disposes listeners', async () => {
    const toast = vi.fn();
    const {result, unmount} = renderHook(() => useServiceState(toast));
    await waitFor(() => expect(result.current.selectedId).toBe('alpha'));
    await waitFor(() => expect(api.GetLogs).toHaveBeenCalled());
    const entry = {serviceId: 'alpha', timestamp: '2026-11-04T00:00:00Z', stream: 'stdout', text: 'v3 live log'};
    act(() => events.get('service:log')?.({data: entry}));
    expect(result.current.logs.at(-1)?.text).toBe('v3 live log');
    const count = result.current.logs.length;
    act(() => events.get('service:log')?.({data: {...entry, serviceId: 'other'}}));
    expect(result.current.logs).toHaveLength(count);
    act(() => events.get('service:logs-cleared')?.({data: {serviceId: 'other'}}));
    expect(result.current.logs).toHaveLength(count);
    act(() => events.get('service:logs-cleared')?.({data: {serviceId: 'alpha'}}));
    expect(result.current.logs).toEqual([]);
    unmount();
    expect(unsubscribed).toHaveBeenCalledTimes(4);
    expect(events.size).toBe(0);
});
