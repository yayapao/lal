import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({...await importOriginal<typeof import('@wailsio/runtime')>(), Events: {On: vi.fn(() => () => undefined)}}));

const game = {
    ...alphaService,
    id: 'amg', name: 'Anti-Magic Gem', module: 'game', projectType: 'godot',
    directory: '/Users/demo/Projects/match-game', command: 'godot --path .',
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
        command: 'godot --path .', url: 'http://127.0.0.1:18040/index.html', cleanCommand: 'rm -rf .godot', scripts: [], sources: ['project.godot', '.lal.json'], warnings: [],
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
        name: 'Anti-Magic Gem', module: 'game', command: 'godot --path .',
        url: 'http://127.0.0.1:18040/index.html', cleanCommand: 'rm -rf .godot',
    })));
});

it('persists the launch mode and starts the selected command through the game entry', async () => {
    const user = userEvent.setup();
    const releaseGame = {...game, launchMode: 'release', releaseCommand: "'dist/Game.app/Contents/MacOS/Game'"};
    api.GetAppState.mockResolvedValue({services: [releaseGame], workspaces: [], configPath: '/tmp/lal.json', warning: ''});
    api.SetGameLaunchMode.mockImplementation(async (id, mode) => {
        api.GetAppState.mockResolvedValue({services: [{...releaseGame, launchMode: mode}], workspaces: [], configPath: '/tmp/lal.json', warning: ''});
    });
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect(await screen.findByRole('button', {name: '启动 正式版 Anti-Magic Gem'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: 'Debug'}));
    await waitFor(() => expect(api.SetGameLaunchMode).toHaveBeenCalledWith('amg', 'debug'));
    expect(api.StartService).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', {name: '启动 Debug Anti-Magic Gem'}));
    expect(api.StartService).toHaveBeenCalledWith('amg');
});

it('keeps the running mode fixed until the game stops', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [{...game, status: 'running', launchMode: 'release', releaseCommand: 'dist/Game'}], workspaces: [], configPath: '/tmp/lal.json', warning: ''});
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    const modes = await screen.findByRole('group', {name: 'Anti-Magic Gem 启动模式'});
    for (const button of within(modes).getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
});

it('opens configuration when the Release command is missing', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(await screen.findByRole('button', {name: '正式'}));
    const dialog = screen.getByRole('dialog', {name: '编辑游戏'});
    await user.type(within(dialog).getByRole('textbox', {name: '正式版启动命令'}), 'dist/Game');
    await user.selectOptions(within(dialog).getByRole('combobox', {name: '默认启动模式'}), 'release');
    await user.click(within(dialog).getByRole('button', {name: '保存'}));
    expect(api.UpdateService).toHaveBeenCalledWith('amg', expect.objectContaining({releaseCommand: 'dist/Game', launchMode: 'release'}));
    expect(api.StartService).not.toHaveBeenCalled();
});
