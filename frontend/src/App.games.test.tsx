import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/go/main/App', () => api);
vi.mock('../wailsjs/runtime/runtime', () => ({EventsOn: vi.fn(() => () => undefined)}));

const game = {
    ...alphaService,
    id: 'amg', name: 'Anti-Magic Gem', module: 'game', projectType: 'godot',
    directory: '/Users/yango/github/apps/amg', command: 'godot --path .',
    url: 'http://127.0.0.1:18040/index.html', cleanCommand: 'rm -rf .godot',
};

beforeEach(() => {
    vi.clearAllMocks();
    api.GetAppState.mockResolvedValue({services: [alphaService, game], workspaces: [], configPath: '/tmp/lal.json', warning: ''});
    api.GetLogs.mockResolvedValue([]);
    api.GetResourceUsage.mockResolvedValue([]);
    api.OpenServiceInVSCode.mockResolvedValue(undefined);
    api.RevealService.mockResolvedValue(undefined);
    api.ChooseDirectory.mockResolvedValue('/tmp/amg');
    api.DetectProject.mockResolvedValue({
        name: 'Anti-Magic Gem', directory: '/tmp/amg', workspace: '', projectType: 'godot',
        command: 'godot --path .', url: '', cleanCommand: 'rm -rf .godot', scripts: [], sources: ['project.godot'], warnings: [],
    });
    api.CreateService.mockResolvedValue({...game, id: 'new-game', directory: '/tmp/amg'});
});

afterEach(cleanup);

it('shows games separately and opens the project in VS Code or Finder', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));

    expect(await screen.findByRole('heading', {name: 'Anti-Magic Gem'})).toBeDefined();
    expect(screen.queryByText('Alpha')).toBeNull();
    await user.click(screen.getByRole('button', {name: '在 VS Code 中打开 Anti-Magic Gem'}));
    await waitFor(() => expect(api.OpenServiceInVSCode).toHaveBeenCalledWith('amg'));
    await user.click(screen.getByRole('button', {name: '在 Finder 中显示 Anti-Magic Gem'}));
    await waitFor(() => expect(api.RevealService).toHaveBeenCalledWith('amg'));
});

it('detects a Godot project in the game form and saves it as a game', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(screen.getByRole('button', {name: '添加游戏'}));
    const dialog = screen.getByRole('dialog', {name: '添加本地游戏'});
    expect(screen.getByRole('heading', {name: '添加本地游戏'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '选择目录'}));
    await waitFor(() => expect((screen.getByRole('textbox', {name: '游戏名称'}) as HTMLInputElement).value).toBe('Anti-Magic Gem'));
    await user.click(within(dialog).getByRole('button', {name: '添加游戏'}));
    await waitFor(() => expect(api.CreateService).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Anti-Magic Gem', module: 'game', command: 'godot --path .', cleanCommand: 'rm -rf .godot',
    })));
});
