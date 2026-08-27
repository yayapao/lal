import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import App from './App';

const api = vi.hoisted(() => ({
    ChooseDirectory: vi.fn(),
    ClearLogs: vi.fn(),
    CreateService: vi.fn(),
    DeleteService: vi.fn(),
    GetAppState: vi.fn(),
    GetLogs: vi.fn(),
    OpenServiceURL: vi.fn(),
    RevealService: vi.fn(),
    StartAll: vi.fn(),
    StartServices: vi.fn(),
    StartService: vi.fn(),
    StopAll: vi.fn(),
    StopServices: vi.fn(),
    StopService: vi.fn(),
    UpdateService: vi.fn(),
}));

vi.mock('../wailsjs/go/main/App', () => api);
vi.mock('../wailsjs/runtime/runtime', () => ({EventsOn: vi.fn(() => () => undefined)}));

describe('selected service actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.GetAppState.mockResolvedValue({
            services: [{
                id: 'alpha',
                name: 'Alpha',
                directory: '/tmp/alpha',
                command: 'npm run dev',
                url: '',
                status: 'stopped',
                pid: 0,
                startedAt: '',
                lastError: '',
                pathExists: true,
                health: '',
                healthInfo: '',
            }],
            configPath: '/tmp/lal.json',
            warning: '',
        });
        api.GetLogs.mockResolvedValue([]);
        api.StartServices.mockResolvedValue({changed: 1, skipped: 0, errors: []});
    });

    afterEach(cleanup);

    it('starts only the checked service', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('checkbox', {name: '选择 Alpha'}));
        await user.click(screen.getByRole('button', {name: '启动选中服务'}));

        await waitFor(() => expect(api.StartServices).toHaveBeenCalledWith(['alpha']));
        expect(api.StartAll).not.toHaveBeenCalled();
    });
});
