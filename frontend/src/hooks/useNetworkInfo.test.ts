import {act, renderHook} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {api} from '../testApi';
import {useNetworkInfo} from './useNetworkInfo';

it('refreshes visible network information every 15 seconds and resumes on visibility changes', async () => {
    vi.useFakeTimers();
    api.GetNetworkInfo.mockResolvedValue({interfaces: [], warnings: []});
    const {unmount} = renderHook(useNetworkInfo);
    await act(async () => {});
    expect(api.GetNetworkInfo).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(api.GetNetworkInfo).toHaveBeenCalledTimes(2);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event('focus')); });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(api.GetNetworkInfo).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(false);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(api.GetNetworkInfo).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event('focus')); });
    expect(api.GetNetworkInfo).toHaveBeenCalledTimes(3);
});
