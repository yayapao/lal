import {renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import * as main from '../../wailsjs/lal/internal/launcher/models';
import {alphaService, api} from '../testApi';
import {useServiceIcons} from './useServiceIcons';

describe('service icon cache', () => {
    const service = (updates: Partial<main.ServiceView> = {}) => main.ServiceView.createFrom({
        ...alphaService, iconPath: '/tmp/alpha/public/logo.png', iconVersion: 'v1', ...updates,
    });

    it('keeps unchanged icons cached and reloads when the file version changes', async () => {
        api.GetServiceIcon.mockResolvedValueOnce('old').mockResolvedValue('new');
        const {result, rerender} = renderHook(({services}) => useServiceIcons(services), {
            initialProps: {services: [service()]},
        });
        await waitFor(() => expect(result.current.alpha).toBe('old'));

        rerender({services: [service({status: 'running'})]});
        expect(api.GetServiceIcon).toHaveBeenCalledTimes(1);

        rerender({services: [service({iconVersion: 'v2'})]});
        await waitFor(() => expect(result.current.alpha).toBe('new'));
        expect(api.GetServiceIcon).toHaveBeenCalledTimes(2);
    });
});
