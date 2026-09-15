import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {alphaService, api, startupPrompt} from './testApi';
import App from './App';

vi.mock('../wailsjs/go/main/App', () => api);
vi.mock('../wailsjs/runtime/runtime', () => ({EventsOn: vi.fn(() => () => undefined)}));

describe('prompt and workspace management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.GetAppState.mockResolvedValue({
            services: [alphaService],
            configPath: '/tmp/lal.json',
            warning: '',
        });
        api.GetLogs.mockResolvedValue([]);
        api.GetResourceUsage.mockResolvedValue([]);
        api.GetPrompts.mockResolvedValue([startupPrompt]);
        api.ChooseAndAddPrompt.mockResolvedValue(true);
        api.CopyCodexPrompt.mockResolvedValue(undefined);
        api.OpenCodexWithPrompt.mockResolvedValue(undefined);
        api.RemovePromptFile.mockResolvedValue(undefined);
    });

    afterEach(cleanup);

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

    it('assigns a service to a workspace from the workspace manager', async () => {
        const user = userEvent.setup();
        api.SetServiceWorkspace.mockResolvedValue({...alphaService, configuredWorkspace: 'ViewAI', workspace: 'ViewAI'});
        render(<App/>);

        await user.click(await screen.findByRole('button', {name: 'Workspace 管理'}));
        const workspace = screen.getByLabelText('Alpha');
        await user.type(workspace, 'ViewAI');
        await user.click(screen.getByRole('button', {name: '保存'}));

        await waitFor(() => expect(api.SetServiceWorkspace).toHaveBeenCalledWith('alpha', 'ViewAI'));
    });
});
