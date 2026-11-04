import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({...await importOriginal<typeof import('@wailsio/runtime')>(), Events: {On: vi.fn(() => () => undefined)}}));

describe('project icon refresh', () => {
    const service = {...alphaService, iconPath: '/tmp/alpha/public/logo.png', iconVersion: 'v1'};
    const iconSource = () => screen.getByRole('img', {name: 'Alpha：Next.js'}).querySelector('img')?.getAttribute('src');

    beforeEach(() => {
        vi.resetAllMocks();
        api.GetAppState.mockResolvedValue({services: [service], configPath: '/tmp/lal.json', warning: ''});
        api.GetLogs.mockResolvedValue([]);
        api.GetResourceUsage.mockResolvedValue([]);
    });

    afterEach(cleanup);

    it('reloads a replaced logo on refresh even when its path and metadata are unchanged', async () => {
        const user = userEvent.setup();
        api.GetServiceIcon.mockResolvedValueOnce('data:image/png;base64,OLD').mockResolvedValue('data:image/png;base64,NEW');
        render(<App/>);
        await waitFor(() => expect(iconSource()).toBe('data:image/png;base64,OLD'));

        await user.click(screen.getByRole('button', {name: '刷新状态'}));

        await waitFor(() => expect(iconSource()).toBe('data:image/png;base64,NEW'));
        expect(api.GetServiceIcon).toHaveBeenCalledTimes(2);
    });
});
