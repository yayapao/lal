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
    GetResourceUsage: vi.fn(),
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

const alphaService = {
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
};

describe('selected service actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.GetAppState.mockResolvedValue({
            services: [alphaService],
            configPath: '/tmp/lal.json',
            warning: '',
        });
        api.GetLogs.mockResolvedValue([]);
        api.GetResourceUsage.mockResolvedValue([]);
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

    it('renders sampled CPU, memory, and process count', async () => {
        api.GetAppState.mockResolvedValue({
            services: [{...alphaService, status: 'running', pid: 42, startedAt: new Date().toISOString()}],
            configPath: '/tmp/lal.json',
            warning: '',
        });
        api.GetResourceUsage.mockResolvedValue([{
            serviceId: 'alpha', cpuPercent: 12.5, memoryBytes: 128 * 1024 ** 2, processCount: 2,
        }]);

        render(<App/>);

        expect(await screen.findByText('12.5%')).toBeDefined();
        expect(screen.getByText('PROC 2')).toBeDefined();
        expect(screen.getAllByText('128 MB').length).toBeGreaterThan(0);
    });
});
