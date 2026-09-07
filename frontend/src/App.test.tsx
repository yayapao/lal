import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import App from './App';

const api = vi.hoisted(() => ({
    ChooseAndAddPrompt: vi.fn(),
    ChooseDirectory: vi.fn(),
    ClearNextCache: vi.fn(),
    ClearLogs: vi.fn(),
    CopyCodexPrompt: vi.fn(),
    CreateService: vi.fn(),
    DeleteService: vi.fn(),
    DownloadLogs: vi.fn(),
    GetAppState: vi.fn(),
    GetLogs: vi.fn(),
    GetPrompts: vi.fn(),
    GetResourceUsage: vi.fn(),
    OpenCodexWithPrompt: vi.fn(),
    OpenServiceURL: vi.fn(),
    RevealService: vi.fn(),
    RemovePromptFile: vi.fn(),
    RestartService: vi.fn(),
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
    cleanCommand: 'rm -rf .next',
    promptFiles: [],
    status: 'stopped',
    pid: 0,
    startedAt: '',
    lastError: '',
    pathExists: true,
    projectType: 'nextjs',
    health: '',
    healthInfo: '',
};

const startupPrompt = {
    name: 'codex-startup.md',
    path: '/tmp/alpha/prompts/codex-startup.md',
    displayPath: 'prompts/codex-startup.md',
    content: 'Start this Codex session',
    source: 'project',
    error: '',
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
        api.GetPrompts.mockResolvedValue([startupPrompt]);
        api.GetResourceUsage.mockResolvedValue([]);
        api.DownloadLogs.mockResolvedValue('/tmp/Alpha.log');
        api.StartServices.mockResolvedValue({changed: 1, skipped: 0, errors: []});
        api.RestartService.mockResolvedValue(undefined);
        api.ClearNextCache.mockResolvedValue(undefined);
        api.ChooseAndAddPrompt.mockResolvedValue(true);
        api.CopyCodexPrompt.mockResolvedValue(undefined);
        api.OpenCodexWithPrompt.mockResolvedValue(undefined);
        api.RemovePromptFile.mockResolvedValue(undefined);
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

    it('puts service search in the titlebar without the accessible count', async () => {
        const {container} = render(<App/>);

        await screen.findByRole('img', {name: 'Alpha：Next.js'});
        expect(container.querySelector('header .search-field input')).not.toBeNull();
        expect(screen.queryByText(/个可访问/)).toBeNull();
    });

    it('opens Prompt management from the service action menu', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));

        expect(await screen.findByRole('region', {name: 'Alpha Prompt 管理'})).toBeDefined();
        expect(screen.getByText('codex-startup.md')).toBeDefined();
        expect(screen.queryByRole('button', {name: '复制 Alpha 的 Codex 启动提示词'})).toBeNull();
    });

    it('copies a Prompt from its card', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));
        await user.click(await screen.findByRole('button', {name: '复制 codex-startup.md 内容'}));

        await waitFor(() => expect(api.CopyCodexPrompt).toHaveBeenCalledWith('alpha', startupPrompt.path));
    });

    it('opens a Codex chat with the Prompt from its card', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));
        await user.click(await screen.findByRole('button', {name: '使用 codex-startup.md 一键启动'}));

        await waitFor(() => expect(api.OpenCodexWithPrompt).toHaveBeenCalledWith('alpha', startupPrompt.path));
    });

    it('adds a Prompt and reloads the cards', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));
        await user.click(await screen.findByRole('button', {name: '添加 Prompt'}));

        await waitFor(() => expect(api.ChooseAndAddPrompt).toHaveBeenCalledWith('alpha'));
        await waitFor(() => expect(api.GetPrompts).toHaveBeenCalledTimes(2));
    });

    it('synchronizes changed Prompt content on demand', async () => {
        const user = userEvent.setup();
        api.GetPrompts
            .mockResolvedValueOnce([startupPrompt])
            .mockResolvedValueOnce([{...startupPrompt, content: 'Updated session prompt'}]);
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));
        expect(await screen.findByText('Start this Codex session')).toBeDefined();
        await user.click(screen.getByRole('button', {name: '同步 Prompt'}));

        expect(await screen.findByText('Updated session prompt')).toBeDefined();
    });

    it('returns to logs from Prompt management', async () => {
        const user = userEvent.setup();
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));
        await user.click(await screen.findByRole('button', {name: '返回日志'}));

        expect(screen.getByRole('region', {name: '服务日志'})).toBeDefined();
    });

    it('removes an externally added Prompt association', async () => {
        const user = userEvent.setup();
        const addedPrompt = {...startupPrompt, source: 'added', path: '/tmp/shared.md', displayPath: '/tmp/shared.md'};
        api.GetPrompts.mockResolvedValueOnce([addedPrompt]).mockResolvedValueOnce([]);
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Alpha 更多操作'}));
        await user.click(screen.getByRole('menuitem', {name: 'Prompt 启动'}));
        await user.click(await screen.findByRole('button', {name: '移除 codex-startup.md 关联'}));

        await waitFor(() => expect(api.RemovePromptFile).toHaveBeenCalledWith('alpha', addedPrompt.path));
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
            name: 'Alpha', directory: '/tmp/alpha', command: 'npm run dev', url: '', cleanCommand: 'rm -rf .next dist/.cache',
        }));
    });
});
