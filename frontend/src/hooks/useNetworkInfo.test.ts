import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {useNetworkInfo} from './useNetworkInfo';

const probe = vi.hoisted(() => vi.fn());
vi.mock('../../wailsjs/go/main/App', () => ({GetNetworkInfo: probe}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('refreshes visible network information every 15 seconds and resumes on visibility changes', async () => {
    vi.useFakeTimers();
    probe.mockReset().mockResolvedValue({interfaces: [], warnings: []});
    const {unmount} = renderHook(useNetworkInfo);
    await act(async () => {});
    expect(probe).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(probe).toHaveBeenCalledTimes(2);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event('focus')); });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(probe).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(false);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(probe).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event('focus')); });
    expect(probe).toHaveBeenCalledTimes(3);
});
