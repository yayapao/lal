import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

const monorepo = {...alphaService, id: 'mono', name: 'Platform', directory: '/tmp/platform', category: 'monorepo',
    launchTargets: [{id: 'worker', name: 'Queue Worker', command: 'npm run jobs', url: 'http://localhost:3920', default: true}],
    targetViews: [{...alphaService, id: 'mono::worker', name: 'Queue Worker'}],
};
const game = {...alphaService, id: 'game', name: 'Puzzle', module: 'game', directory: '/tmp/puzzle', projectType: 'godot'};

it('searches every category from either module and opens the matching process without launching it', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [alphaService, monorepo, game]});
    render(<App/>);
    await screen.findByRole('checkbox', {name: '选择 Alpha'});
    const search = screen.getByRole('textbox', {name: '全局搜索'});
    await user.type(search, '3920');
    expect(screen.getByRole('button', {name: '打开 Platform / Queue Worker'})).toBeDefined();
    expect(screen.queryByRole('button', {name: '打开 Alpha'})).toBeNull();
    await user.click(screen.getByRole('button', {name: '打开 Platform / Queue Worker'}));
    expect(search).toHaveProperty('value', '');
    expect(screen.getByRole('button', {name: 'Monorepo 1'}).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('combobox', {name: '日志进程'})).toHaveProperty('value', 'mono::worker');
    expect(screen.getByRole('button', {name: '查看 Queue Worker 的日志'}).getAttribute('aria-pressed')).toBe('true');
    await user.type(search, 'Puzzle');
    await user.click(screen.getByRole('button', {name: '打开 Puzzle'}));
    expect(screen.getByRole('tab', {name: '游戏'}).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', {name: 'Puzzle'})).toBeDefined();
    await user.type(search, 'Alpha');
    await user.click(screen.getByRole('button', {name: '打开 Alpha'}));
    expect(screen.getByRole('tab', {name: '服务'}).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', {name: '普通服务 1'}).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('checkbox', {name: '选择 Alpha'})).toBeDefined();
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.StopService).not.toHaveBeenCalled();
    expect(api.DeleteService).not.toHaveBeenCalled();
});

it('limits ordinary service statistics and batch actions to their category', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [alphaService, monorepo, game]});
    api.StartServices.mockResolvedValue({changed: 1, skipped: 0, errors: []});
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: '全部启动'}));
    expect(api.StartServices).toHaveBeenCalledWith(['alpha']);
    expect(api.StartAll).not.toHaveBeenCalled();
    const list = within(screen.getByRole('region', {name: '服务列表'}));
    expect(list.queryByRole('heading', {name: 'Platform'})).toBeNull();
    expect(list.queryByRole('checkbox', {name: '选择 Platform'})).toBeNull();
    await user.click(list.getByRole('button', {name: 'Monorepo 1'}));
    expect(screen.getByRole('button', {name: '查看 Queue Worker 的日志'})).toBeDefined();
});

it('keeps structurally detected monorepos in their category before process configuration', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [alphaService, {...monorepo, launchTargets: [], targetViews: []}]});
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Monorepo 1'}));
    expect(screen.getByText('尚未配置项目进程')).toBeDefined();
    await user.click(screen.getByLabelText('Platform 项目操作'));
    await user.click(screen.getByRole('button', {name: '启动项目'}));
    await waitFor(() => expect(api.StartService).toHaveBeenCalledWith('mono'));
});
