import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, expect, it} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

const profiles = [
    {id: 'mac-zh', name: 'Mac · 中文', command: 'build --mac --zh'},
    {id: 'web-en', name: 'Web · English', command: 'build --web --en'},
];
const game = {...alphaService, id: 'amg', name: 'Anti-Magic Gem', module: 'game', projectType: 'godot',
    directory: '/tmp/amg', command: 'godot --path .', releaseCommand: 'dist/Game', launchMode: 'release',
    buildCommand: 'build-default', buildBeforeLaunch: true, buildProfiles: profiles};

beforeEach(() => {
    api.GetAppState.mockResolvedValue({services: [game], workspaces: [], warning: ''});

    api.UpdateService.mockResolvedValue(game);
});

it('runs the named profile directly without changing launch mode or starting the game', async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(await screen.findByRole('button', {name: '构建 Anti-Magic Gem'}));
    const menu = screen.getByRole('menu', {name: 'Anti-Magic Gem 打包方案'});
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['默认构建', 'Mac · 中文', 'Web · English']);
    await user.click(within(menu).getByRole('menuitem', {name: 'Web · English'}));
    expect(api.BuildGameProfile).toHaveBeenCalledWith('amg', 'web-en');
    expect(api.BuildGame).not.toHaveBeenCalled();
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.SetGameLaunchMode).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
});

it('supports profiles without a default build, and Escape closes without building', async () => {
    api.GetAppState.mockResolvedValue({services: [{...game, buildCommand: '', buildBeforeLaunch: false}], workspaces: [], warning: ''});
    const user = userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    const trigger = await screen.findByRole('button', {name: '构建 Anti-Magic Gem'});
    await user.click(trigger);
    expect(screen.queryByRole('menuitem', {name: '默认构建'})).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', {name: 'Mac · 中文'}));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', {name: 'Web · English'}));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(api.BuildGameProfile).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', {name: 'Mac · 中文'}));
    expect(api.BuildGameProfile).toHaveBeenCalledWith('amg', 'mac-zh');
});

it('shows the actual active profile command and disables further builds', async () => {
    api.GetAppState.mockResolvedValue({services: [{...game, status: 'building', activeBuildName: 'Web · English', activeBuildCommand: 'build --web --en'}], workspaces: [], warning: ''});
    const user = userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect(await screen.findByText('Web · English')).toBeDefined();
    expect(screen.getByText('build --web --en')).toBeDefined();
    expect((screen.getByRole('button', {name: '构建 Anti-Magic Gem'}) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', {name: '取消构建 Anti-Magic Gem'}));
    expect(api.StopService).toHaveBeenCalledWith('amg');
});

it('edits, adds and removes profiles while preserving the default build and startup', async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(await screen.findByRole('button', {name: 'Anti-Magic Gem 更多操作'}));
    await user.click(screen.getByRole('menuitem', {name: '编辑配置'}));
    const dialog = screen.getByRole('dialog', {name: '编辑游戏'});
    await user.clear(within(dialog).getByRole('textbox', {name: '打包方案 1 名称'}));
    await user.type(within(dialog).getByRole('textbox', {name: '打包方案 1 名称'}), 'Mac 中文包');
    await user.click(within(dialog).getByRole('button', {name: '删除打包方案 2'}));
    await user.click(within(dialog).getByRole('button', {name: '添加打包方案'}));
    await user.type(within(dialog).getByRole('textbox', {name: '打包方案 2 名称'}), 'Web 中文包');
    await user.type(within(dialog).getByRole('textbox', {name: '打包方案 2 命令'}), 'build --web --zh');
    await user.click(within(dialog).getByRole('button', {name: '保存'}));
    await waitFor(() => expect(api.UpdateService).toHaveBeenCalledWith('amg', expect.objectContaining({
        buildCommand: 'build-default', releaseCommand: 'dist/Game', launchMode: 'release', buildBeforeLaunch: true,
        buildProfiles: [{...profiles[0], name: 'Mac 中文包'}, {id: expect.any(String), name: 'Web 中文包', command: 'build --web --zh'}],
    })));
    expect(api.BuildGameProfile).not.toHaveBeenCalled();
});

it('reads project profiles into the form and does not execute them', async () => {
    api.DetectProject.mockResolvedValue({name: game.name, directory: game.directory, workspace: '', projectType: 'godot', command: 'other-debug', releaseCommand: 'other-release', buildCommand: 'other-default', buildProfiles: [profiles[1]], scripts: [], sources: ['.lal.json'], warnings: []});
    const user = userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(await screen.findByRole('button', {name: 'Anti-Magic Gem 更多操作'}));
    await user.click(screen.getByRole('menuitem', {name: '编辑配置'}));
    const dialog = screen.getByRole('dialog', {name: '编辑游戏'});
    await user.click(within(dialog).getByRole('button', {name: '从项目读取'}));
    await waitFor(() => expect((within(dialog).getByRole('textbox', {name: '打包方案 1 名称'}) as HTMLInputElement).value).toBe('Web · English'));
    await user.click(within(dialog).getByRole('button', {name: '保存'}));
    await waitFor(() => expect(api.UpdateService).toHaveBeenCalledWith('amg', expect.objectContaining({buildProfiles: [profiles[1]], buildCommand: 'build-default', releaseCommand: 'dist/Game'})));
    expect(api.BuildGameProfile).not.toHaveBeenCalled();
});
