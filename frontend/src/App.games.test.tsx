import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

const game = {
    ...alphaService,
    id: 'amg', name: 'Anti-Magic Gem', module: 'game', projectType: 'godot',
    directory: '/Users/demo/Projects/match-game', command: 'godot --path .',
    url: 'http://127.0.0.1:18040/index.html', cleanCommand: 'rm -rf .godot',
};

beforeEach(() => {
    api.GetAppState.mockResolvedValue({services: [alphaService, game], workspaces: [], configPath: '/tmp/lal.json', warning: ''});

    api.RevealService.mockResolvedValue(undefined);
    api.ChooseDirectory.mockResolvedValue('/tmp/amg');
    api.DetectProject.mockResolvedValue({
        name: 'Anti-Magic Gem', directory: '/tmp/amg', workspace: '', projectType: 'godot',
        command: 'godot --path .', url: 'http://127.0.0.1:18040/index.html', cleanCommand: 'rm -rf .godot', scripts: [], sources: ['project.godot', '.lal.json'], warnings: [],
    });
    api.CreateService.mockResolvedValue({...game, id: 'new-game', directory: '/tmp/amg'});
});

it('shows games separately and reveals the project in Finder', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));

    expect(await screen.findByRole('heading', {name: 'Anti-Magic Gem'})).toBeDefined();
    expect(screen.queryByText('Alpha')).toBeNull();
    await user.click(screen.getByRole('button', {name: 'Anti-Magic Gem 更多操作'}));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual([
        '编辑配置', '重启游戏', '执行缓存清理', '在 Finder 中显示', '移除游戏',
    ]);
    await user.click(screen.getByRole('button', {name: '关闭菜单'}));
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
    api.SetGameLaunchMode.mockImplementation(async (_id, mode) => {
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

it('builds without launching and labels formal startup with its build step', async () => {
    const user = userEvent.setup();
    const configured = {...game, launchMode: 'release', releaseCommand: 'dist/Game', buildCommand: 'make export', buildBeforeLaunch: true};
    api.GetAppState.mockResolvedValue({services: [configured], workspaces: [], warning: ''});
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect(await screen.findByRole('button', {name: '构建并启动 Anti-Magic Gem'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '构建 Anti-Magic Gem'}));
    expect(api.BuildGame).toHaveBeenCalledWith('amg');
    expect(api.StartService).not.toHaveBeenCalled();
});

it('allows cancelling a build and blocks duplicate builds and mode switches', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [{...game, status: 'building', buildCommand: 'make export'}], workspaces: [], warning: ''});
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect((await screen.findAllByText('构建中')).length).toBeGreaterThan(0);
    expect((screen.getByRole('button', {name: '构建 Anti-Magic Gem'}) as HTMLButtonElement).disabled).toBe(true);
    for (const button of within(screen.getByRole('group', {name: 'Anti-Magic Gem 启动模式'})).getAllByRole('button')) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    await user.click(screen.getByRole('button', {name: '取消构建 Anti-Magic Gem'}));
    expect(api.StopService).toHaveBeenCalledWith('amg');
    expect(api.StartService).not.toHaveBeenCalled();
});

it('opens build configuration and saves the build command and startup choice', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(screen.getByRole('button', {name: '构建 Anti-Magic Gem'}));
    const dialog = screen.getByRole('dialog', {name: '编辑游戏'});
    await user.type(within(dialog).getByRole('textbox', {name: '构建并导出命令'}), 'make export');
    const checkbox = within(dialog).getByRole('checkbox', {name: '正式启动前构建并导出'}) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    await user.click(checkbox);
    await user.click(within(dialog).getByRole('button', {name: '保存'}));
    expect(api.UpdateService).toHaveBeenCalledWith('amg', expect.objectContaining({buildCommand: 'make export', buildBeforeLaunch: false}));
    expect(api.BuildGame).not.toHaveBeenCalled();
});
