import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

vi.mock('../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({...await importOriginal<typeof import('@wailsio/runtime')>(), Events: {On: vi.fn(() => () => undefined)}}));

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('localStorage', {getItem: () => null, setItem: vi.fn()});
    api.GetLogs.mockResolvedValue([]);
    api.GetResourceUsage.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('folds groups independently and retains their summary, selection, and state across refresh and search', async () => {
    const user = userEvent.setup();
    const services = [
        {...alphaService, workspace: '工作区 A', status: 'running', url: 'http://localhost:3000', health: 'ready'},
        {...alphaService, id: 'beta', name: 'Beta', workspace: '工作区 A', status: 'failed'},
        {...alphaService, id: 'gamma', name: 'Gamma', workspace: '工作区 B'},
    ];
    api.GetAppState.mockResolvedValue({services, configPath: '/tmp/lal.json', warning: ''});
    api.GetResourceUsage.mockResolvedValue([{serviceId: 'alpha', cpuPercent: 12.5, memoryBytes: 128 * 1024 ** 2, processCount: 2}]);
    render(<App/>);
    await user.click(await screen.findByRole('checkbox', {name: '选择 Alpha'}));

    await user.click(screen.getByRole('button', {name: '收起 工作区 A'}));

    const folded = screen.getByRole('button', {name: '展开 工作区 A'});
    expect(window.localStorage.setItem).toHaveBeenCalledWith('lal:collapsed-workspaces', '["工作区 A"]');
    expect(folded.getAttribute('aria-expanded')).toBe('false');
    expect(within(folded).getByText('2 个服务')).toBeDefined();
    expect(within(folded).getByText('已选 1')).toBeDefined();
    expect(folded.textContent).toContain('运行 1');
    expect(folded.textContent).toContain('可访问 1');
    expect(folded.textContent).toContain('异常 1');
    await waitFor(() => expect(within(folded).getByText('128 MB')).toBeDefined());
    expect(screen.queryByRole('checkbox', {name: '选择 Alpha'})).toBeNull();
    expect(screen.getByRole('checkbox', {name: '选择 Gamma'})).toBeDefined();

    api.GetAppState.mockResolvedValue({services: services.map(service => ({...service, status: 'stopped', health: 'stopped'})), configPath: '/tmp/lal.json', warning: ''});
    await user.click(screen.getByRole('button', {name: '刷新状态'}));
    await waitFor(() => expect(screen.getByRole('button', {name: '展开 工作区 A'}).textContent).toContain('运行 0'));

    await user.type(screen.getByRole('textbox', {name: '搜索服务'}), 'Alpha');
    expect((screen.getByRole('checkbox', {name: '选择 Alpha'}) as HTMLInputElement).checked).toBe(true);
    await user.clear(screen.getByRole('textbox', {name: '搜索服务'}));
    expect(screen.getByRole('button', {name: '展开 工作区 A'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '展开 工作区 A'}));
    expect((screen.getByRole('checkbox', {name: '选择 Alpha'}) as HTMLInputElement).checked).toBe(true);
});
