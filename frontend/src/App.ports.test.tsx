import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({...await importOriginal<typeof import('@wailsio/runtime')>(), Events: {On: vi.fn(() => () => undefined)}}));

const port = {pid: 123, command: 'python3 -m http.server 18040', directory: '/tmp/alpha', identity: 'start-time command', matchesProject: true, accessible: true, previewOnly: false};
const external = {...alphaService, url: 'http://127.0.0.1:18040', port};

beforeEach(() => {
    vi.clearAllMocks();
    api.GetAppState.mockResolvedValue({services: [external], workspaces: [], warning: ''});
    api.GetLogs.mockResolvedValue([]);
    api.GetResourceUsage.mockResolvedValue([]);
    api.StopExternalAndStart.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('shows external state and requires confirmation before stopping and starting', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: '处理外部服务 Alpha'}));
    expect(screen.getAllByText('外部运行').length).toBeGreaterThan(0);
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.StopExternalAndStart).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: '停止外部服务并由 LAL 启动'}));
    await waitFor(() => expect(api.StopExternalAndStart).toHaveBeenCalledWith('alpha', 123, 'start-time command'));
});

it('offers editing for an unrelated listener and never stops it', async () => {
    api.GetAppState.mockResolvedValue({services: [{...external, port: {...port, matchesProject: false}}], workspaces: [], warning: ''});
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: '处理端口冲突 Alpha'}));
    expect(screen.queryByRole('button', {name: '停止外部服务并由 LAL 启动'})).toBeNull();
    await user.click(screen.getByRole('button', {name: '编辑配置'}));
    expect(screen.getByRole('dialog', {name: '编辑服务'})).toBeDefined();
    expect(api.StopExternalAndStart).not.toHaveBeenCalled();
});

it('keeps the confirmation open and displays a failed takeover', async () => {
    api.StopExternalAndStart.mockRejectedValue('端口占用进程已变化');
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: '处理外部服务 Alpha'}));
    await user.click(screen.getByRole('button', {name: '停止外部服务并由 LAL 启动'}));
    expect(await screen.findByText('端口占用进程已变化')).toBeDefined();
});

it('starts a native game while its independent web preview is running', async () => {
    api.GetAppState.mockResolvedValue({services: [{...external, module: 'game', projectType: 'godot', command: 'godot --path .', port: {...port, previewOnly: true}}], workspaces: [], warning: ''});
    api.StartService.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('tab', {name: '游戏'}));
    expect(await screen.findByText(/与原生游戏独立/)).toBeDefined();
    await user.click(screen.getByRole('button', {name: '启动 Alpha'}));
    await waitFor(() => expect(api.StartService).toHaveBeenCalledWith('alpha'));
    expect(api.StopExternalAndStart).not.toHaveBeenCalled();
});
