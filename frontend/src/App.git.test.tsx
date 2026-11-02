import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/go/main/App', () => api);
vi.mock('../wailsjs/runtime/runtime', () => ({EventsOn: vi.fn(() => () => undefined)}));

const status = {
    serviceId: 'alpha', directory: '/tmp/alpha', state: 'dirty', root: '/tmp/alpha', branch: 'feature/workspace', commit: 'abc1234',
    detached: false, unborn: false, upstream: 'origin/main', ahead: 2, behind: 0,
    changed: 2, staged: 1, unstaged: 0, untracked: 1, conflicts: 0, error: '', checkedAt: '2026-10-14T10:00:00+08:00',
};
const details = {
    status, gitDir: '/tmp/alpha/.git', truncated: false, configError: '',
    files: [
        {path: 'src/new name.ts', previousPath: 'src/old.ts', indexStatus: 'R', worktreeStatus: '.', untracked: false, conflict: false},
        {path: 'notes.md', previousPath: '', indexStatus: '', worktreeStatus: '', untracked: true, conflict: false},
    ],
    config: [{key: 'user.name', value: 'Yango'}, {key: 'remote.origin.url', value: 'git@example.test:lal.git'},
        {key: 'lal.multiple', value: 'line one\nline two'}, {key: 'lal.multiple', value: 'another value'}, {key: 'lal.empty', value: ''}],
};

beforeEach(() => {
    vi.clearAllMocks();
    api.GetAppState.mockResolvedValue({services: [alphaService], workspaces: [], configPath: '/tmp/lal.json', warning: ''});
    api.GetLogs.mockResolvedValue([]);
    api.GetResourceUsage.mockResolvedValue([]);
    api.GetGitStatuses.mockResolvedValue([status]);
    api.GetServiceGitDetails.mockResolvedValue(details);
});
afterEach(cleanup);

it('opens repository changes from the list and shows searchable local configuration', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await screen.findAllByText('feature/workspace');
    await user.click(screen.getAllByRole('button', {name: '查看 Alpha 的 Git 状态'})[0]);

    const pane = await screen.findByRole('region', {name: 'Alpha Git 详情'});
    expect(await within(pane).findByText('src/new name.ts')).toBeDefined();
    expect(within(pane).getByText('原路径：src/old.ts')).toBeDefined();
    expect(within(pane).getByText('??')).toBeDefined();
    expect(api.GetServiceGitDetails).toHaveBeenCalledWith('alpha');

    within(pane).getByRole('tab', {name: '变更文件 2'}).focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(within(pane).getByRole('tab', {name: '本地配置 5'}));
    expect(within(pane).getByText('git config --list --local')).toBeDefined();
    expect(within(pane).getAllByText('lal.multiple')).toHaveLength(2);
    expect(within(pane).getByText('line one line two')).toBeDefined();
    await user.type(within(pane).getByRole('searchbox', {name: '搜索 Git 配置'}), 'remote');
    expect(within(pane).getByText('git@example.test:lal.git')).toBeDefined();
    expect(within(pane).queryByText('user.name')).toBeNull();

    await user.click(within(pane).getByRole('button', {name: '日志'}));
    expect(await screen.findByRole('region', {name: '服务日志'})).toBeDefined();
    expect(api.StartService).not.toHaveBeenCalled();
});

it('refreshes Git details and the project badge without affecting service controls', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Git 详情'}));
    await screen.findByText('src/new name.ts');
    api.GetServiceGitDetails.mockResolvedValue({...details, status: {...status, state: 'clean', changed: 0, staged: 0, untracked: 0}, files: []});

    await user.click(screen.getByRole('button', {name: '刷新 Git 状态'}));
    expect(await screen.findByText('工作区干净')).toBeDefined();
    expect(screen.getByRole('button', {name: '查看 Alpha 的 Git 状态'}).textContent).toContain('干净');

    await user.click(screen.getByRole('button', {name: '刷新状态'}));
    await waitFor(() => expect(api.GetGitStatuses).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(3));
});

it('distinguishes an unavailable repository and a local configuration error', async () => {
    const user = userEvent.setup();
    api.GetServiceGitDetails.mockResolvedValue({...details, config: [], configError: '无法读取本地配置'});
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Git 详情'}));
    const pane = await screen.findByRole('region', {name: 'Alpha Git 详情'});
    await screen.findByText('src/new name.ts');
    await user.click(screen.getByRole('tab', {name: '本地配置 0'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '无法读取本地配置');

    api.GetServiceGitDetails.mockResolvedValue({...details, status: {...status, state: 'not_repository', root: ''}, files: [], config: [], gitDir: ''});
    await user.click(screen.getByRole('button', {name: '刷新 Git 状态'}));
    expect(await screen.findByText('项目目录及其父目录中未发现 Git 仓库。')).toBeDefined();
    expect(within(pane).queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('工作区干净')).toBeNull();
});

it('keeps a configuration draft while switching tabs and refreshes details after saving', async () => {
    const user = userEvent.setup();
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Git 详情'}));
    await screen.findByText('src/new name.ts');
    await user.click(screen.getByRole('tab', {name: '本地配置 5'}));
    await user.click(screen.getByRole('button', {name: '用户名'}));
    await user.clear(screen.getByRole('textbox', {name: '配置值'}));
    await user.type(screen.getByRole('textbox', {name: '配置值'}), 'New Name');
    await user.click(screen.getByRole('tab', {name: '变更文件 2'}));
    await user.click(screen.getByRole('tab', {name: '本地配置 5'}));
    expect(screen.getByRole('textbox', {name: '配置值'})).toHaveProperty('value', 'New Name');
    await user.click(screen.getByRole('button', {name: '刷新状态'}));
    await waitFor(() => expect(api.GetGitStatuses).toHaveBeenCalledTimes(2));
    expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', {name: '配置值'})).toHaveProperty('value', 'New Name');
    api.GetServiceGitDetails.mockResolvedValue({...details, config: details.config.map(entry => entry.key === 'user.name' ? {...entry, value: 'New Name'} : entry)});
    await user.click(screen.getByRole('button', {name: '保存配置'}));
    await waitFor(() => expect(api.UpdateGitConfig).toHaveBeenCalledWith('alpha', {
        directory: '/tmp/alpha', root: '/tmp/alpha', key: 'user.name', expectedValues: ['Yango'], values: ['New Name'],
    }));
    expect(await screen.findByText('user.name 已保存')).toBeDefined();
    expect(screen.getByText('New Name')).toBeDefined();
    expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(2);
});
