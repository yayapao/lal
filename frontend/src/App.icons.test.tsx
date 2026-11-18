import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

describe('project icon refresh', () => {
    const service = {...alphaService, iconPath: '/tmp/alpha/public/logo.png', iconVersion: 'v1'};
    const iconSource = () => screen.getByRole('img', {name: 'Alpha：Next.js'}).querySelector('img')?.getAttribute('src');

    beforeEach(() => {
        api.GetAppState.mockResolvedValue({services: [service], configPath: '/tmp/lal.json', warning: ''});
    });

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
