import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({...await importOriginal<typeof import('@wailsio/runtime')>(), Events: {On: vi.fn(() => () => undefined)}}));

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
        api.DownloadLogs.mockResolvedValue('/tmp/Alpha.log');
        api.StartServices.mockResolvedValue({changed: 1, skipped: 0, errors: []});
        api.RestartService.mockResolvedValue(undefined);
        api.ClearNextCache.mockResolvedValue(undefined);
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

    it('refreshes the service state on demand', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: '刷新状态'}));

        await waitFor(() => expect(api.GetAppState).toHaveBeenCalledTimes(2));
    });

    it('keeps rendering when refresh returns no logs', async () => {
        const user = userEvent.setup();
        api.GetLogs.mockResolvedValueOnce([]).mockResolvedValueOnce(null);
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: '刷新状态'}));

        await waitFor(() => expect(api.GetLogs).toHaveBeenCalledTimes(2));
        expect(screen.getByRole('img', {name: 'Alpha：Next.js'})).toBeDefined();
        expect(screen.getByText('暂无日志')).toBeDefined();
    });

    it('uses the detected project icon for a Next.js service', async () => {
        render(<App/>);

        expect(await screen.findByRole('img', {name: 'Alpha：Next.js'})).toBeDefined();
    });

    it('loads a project logo through the service icon binding', async () => {
        api.GetAppState.mockResolvedValueOnce({
            services: [{...alphaService, iconPath: '/tmp/alpha/public/logo.png'}],
            configPath: '/tmp/lal.json',
            warning: '',
        });
        api.GetServiceIcon.mockResolvedValue('data:image/png;base64,AAA');
        render(<App/>);

        const icon = await screen.findByRole('img', {name: 'Alpha：Next.js'});
        await waitFor(() => expect(icon.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAA'));
    });

    it('puts service search in the titlebar without the accessible count', async () => {
        const {container} = render(<App/>);

        await screen.findByRole('img', {name: 'Alpha：Next.js'});
        expect(container.querySelector('header .search-field input')).not.toBeNull();
        expect(screen.queryByText(/个可访问/)).toBeNull();
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

    it('downloads the selected service logs', async () => {
        const user = userEvent.setup();
        api.GetLogs.mockResolvedValue([{
            serviceId: 'alpha', timestamp: '2026-08-27T15:30:45+08:00', stream: 'stdout', text: 'ready',
        }]);
        render(<App/>);

        const button = await screen.findByRole('button', {name: '下载日志'});
        await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
        await user.click(button);

        expect(api.DownloadLogs).toHaveBeenCalledWith('alpha');
    });

    it('shows startup diagnostics when a service cannot start', async () => {
        const user = userEvent.setup();
        api.StartService.mockRejectedValue('端口 3900 已被 node 占用。\n检查命令：lsof');
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: '启动 Alpha'}));

        expect(await screen.findByRole('alertdialog', {name: 'Alpha 无法启动'})).toBeDefined();
        expect(screen.getByText(/检查命令：lsof/)).toBeDefined();
    });

    it('restarts a service from its action menu', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: '重启服务'}));

        await waitFor(() => expect(api.RestartService).toHaveBeenCalledWith('alpha'));
    });

    it('confirms and executes the configured cache cleanup', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: '执行缓存清理'}));
        expect(screen.getByRole('alertdialog', {name: '执行 Alpha 的缓存清理？'})).toBeDefined();
        await user.click(screen.getByRole('button', {name: '清除缓存'}));

        await waitFor(() => expect(api.ClearNextCache).toHaveBeenCalledWith('alpha'));
    });

    it('persists a custom cache cleanup command from the service editor', async () => {
        const user = userEvent.setup();
        api.UpdateService.mockResolvedValue({...alphaService, cleanCommand: 'rm -rf .next dist/.cache'});
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: '编辑配置'}));
        const command = screen.getByLabelText(/缓存清理脚本/);
        await user.clear(command);
        await user.type(command, 'rm -rf .next dist/.cache');
        await user.click(screen.getByRole('button', {name: '保存'}));

        await waitFor(() => expect(api.UpdateService).toHaveBeenCalledWith('alpha', {
            name: 'Alpha', module: 'service', workspace: '', directory: '/tmp/alpha', command: 'npm run dev', url: '', cleanCommand: 'rm -rf .next dist/.cache',
        }));
    });
});
