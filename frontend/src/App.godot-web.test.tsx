import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

const game = {
    ...alphaService, id: 'godot', name: 'Godot Game', module: 'game', projectType: 'godot',
    command: 'godot --path .',
    godotWeb: {status: 'stopped', url: '', entryPath: '/tmp/game/dist/play.html', preset: 'Web', available: true, lastError: ''},
};

function state(service = game) {
    api.GetAppState.mockResolvedValue({services: [service], workspaces: [], warning: ''});
}

it('starts the browser server and opens the game without starting native play', async () => {
    const user = userEvent.setup();
    state();
    api.StartGodotWeb.mockImplementation(async () => state({...game, godotWeb: {...game.godotWeb, status: 'running', url: 'http://127.0.0.1:18040/play.html'}}));
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    const panel = screen.getByRole('region', {name: 'Godot Game 浏览器服务'});
    expect(within(panel).getByRole('status').textContent).toBe('已停止');
    await user.click(within(panel).getByRole('button', {name: '启动浏览器 Godot Game'}));
    await waitFor(() => expect(api.OpenGodotWeb).toHaveBeenCalledWith('godot'));
    expect(api.StartGodotWeb).toHaveBeenCalledWith('godot');
    expect(api.StartService).not.toHaveBeenCalled();
    expect(await within(panel).findByRole('button', {name: '打开游玩 Godot Game'})).toBeDefined();
    expect(within(panel).getByRole('status').textContent).toBe('运行中');
    expect(screen.getByText('浏览器运行')).toBeDefined();
});

it('opens and stops an existing browser server while native play keeps running', async () => {
    const user = userEvent.setup();
    state({...game, status: 'running', godotWeb: {...game.godotWeb, status: 'running', url: 'http://127.0.0.1:18040/play.html'}});
    api.StopGodotWeb.mockImplementation(async () => state({...game, status: 'running'}));
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(screen.getByRole('button', {name: '打开游玩 Godot Game'}));
    expect(api.OpenGodotWeb).toHaveBeenCalledWith('godot');
    expect(api.StartGodotWeb).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: '停止浏览器服务 Godot Game'}));
    await waitFor(() => expect(api.StopGodotWeb).toHaveBeenCalledWith('godot'));
    expect(api.StopService).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', {name: '停止 Godot Game'})).toBeDefined();
});

it('explains a missing export and disables browser launch during builds', async () => {
    const user = userEvent.setup();
    state({...game, godotWeb: {...game.godotWeb, available: false, lastError: '请先构建 Web'}});
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect(screen.getByText('待导出')).toBeDefined();
    expect(screen.getByText('请先构建 Web')).toBeDefined();
    expect((screen.getByRole('button', {name: '启动浏览器 Godot Game'}) as HTMLButtonElement).disabled).toBe(true);
    state({...game, status: 'building'});
    await user.click(screen.getByRole('button', {name: '刷新游戏状态'}));
    await waitFor(() => expect(screen.queryByText('待导出')).toBeNull());
    expect((screen.getByRole('button', {name: '启动浏览器 Godot Game'}) as HTMLButtonElement).disabled).toBe(true);
});

it('shows a failed start and allows retry without opening a stale URL', async () => {
    const user = userEvent.setup();
    state();
    api.StartGodotWeb.mockImplementation(async () => {
        state({...game, godotWeb: {...game.godotWeb, status: 'failed', lastError: '浏览器服务端口已被占用'}});
        throw new Error('浏览器服务端口已被占用');
    });
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    await user.click(screen.getByRole('button', {name: '启动浏览器 Godot Game'}));
    await waitFor(() => expect(screen.getByText('启动失败')).toBeDefined());
    expect(api.OpenGodotWeb).not.toHaveBeenCalled();
    expect((screen.getByRole('button', {name: '启动浏览器 Godot Game'}) as HTMLButtonElement).disabled).toBe(false);
});

it('prevents rebuilding an export being served and hides the entry on other engines', async () => {
    const user = userEvent.setup();
    state({...game, buildCommand: 'make web', godotWeb: {...game.godotWeb, status: 'running'}} as typeof game);
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect((screen.getByRole('button', {name: '构建 Godot Game'}) as HTMLButtonElement).disabled).toBe(true);
    state({...game, projectType: 'unity'});
    await user.click(screen.getByRole('button', {name: '刷新游戏状态'}));
    await waitFor(() => expect(screen.queryByRole('region', {name: 'Godot Game 浏览器服务'})).toBeNull());
});

it('opens an external browser service without offering to stop an unmanaged process', async () => {
    const user = userEvent.setup();
    state({...game, godotWeb: {...game.godotWeb, status: 'external', url: 'http://127.0.0.1:18040/play.html'}});
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect(screen.getByText('外部可访问')).toBeDefined();
    expect(screen.queryByRole('button', {name: '停止浏览器服务 Godot Game'})).toBeNull();
    await user.click(screen.getByRole('button', {name: '打开游玩 Godot Game'}));
    expect(api.OpenGodotWeb).toHaveBeenCalledWith('godot');
    expect(api.StartGodotWeb).not.toHaveBeenCalled();
});
