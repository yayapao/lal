import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import * as main from '../wailsjs/lal/internal/launcher/models';
import LaunchTargetPanel from './components/LaunchTargetPanel';
import ServiceDialog from './components/ServiceDialog';
import App from './App';

const targets = [
    {id: 'web', name: 'Web', command: 'npm run dev:web', url: '', default: true},
    {id: 'ppt', name: 'PPT', command: 'npm run dev:ppt', url: 'http://localhost:3930', default: false},
];
const project = () => main.ServiceView.createFrom({...alphaService, launchTargets: targets,
    targetViews: targets.map(target => ({...alphaService, ...target, id: `alpha::${target.id}`}))});

it('selects a process for logs without starting it and keeps independent process controls', async () => {
    const user = userEvent.setup();
    const onSelectTarget = vi.fn();
    render(<LaunchTargetPanel service={project()} disabled={false} selectedTargetId="" onSelectTarget={onSelectTarget}/>);
    await user.click(screen.getByRole('button', {name: '0 / 2 个进程运行中'}));
    await user.click(screen.getByRole('button', {name: '查看 PPT 的日志'}));
    expect(onSelectTarget).toHaveBeenCalledWith('alpha::ppt');
    expect(api.StartService).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', {name: '启动所选'})).toBeNull();
    expect(screen.queryByRole('button', {name: '设为默认'})).toBeNull();
    await user.click(screen.getByRole('button', {name: '启动进程 PPT'}));
    expect(api.StartService).toHaveBeenCalledWith('alpha::ppt');
    await user.click(screen.getByRole('button', {name: 'localhost:3930'}));
    expect(api.OpenServiceURL).toHaveBeenCalledWith('alpha::ppt');
    expect(onSelectTarget).toHaveBeenCalledTimes(1);
});

it('keeps the log selection across status refresh and shows process control failures', async () => {
    const user = userEvent.setup();
    const onSelectTarget = vi.fn();
    const {rerender} = render(<LaunchTargetPanel service={project()} disabled={false} selectedTargetId="alpha::ppt" onSelectTarget={onSelectTarget}/>);
    const running = project();
    running.targetViews![0].status = 'running';
    rerender(<LaunchTargetPanel service={running} disabled={false} selectedTargetId="alpha::ppt" onSelectTarget={onSelectTarget}/>);
    expect(screen.getByRole('button', {name: '查看 PPT 的日志'}).getAttribute('aria-pressed')).toBe('true');
    api.StopService.mockRejectedValueOnce(new Error('停止失败'));
    await user.click(screen.getByRole('button', {name: '停止进程 Web'}));
    expect((await screen.findByRole('alert')).textContent).toContain('停止失败');
    expect(onSelectTarget).not.toHaveBeenCalled();
});

it('imports the project declaration while editing and persists process defaults', async () => {
    const user = userEvent.setup();
    api.DetectProject.mockResolvedValueOnce({...alphaService, launchTargets: targets, warnings: []});
    api.UpdateService.mockResolvedValueOnce(project());
    render(<ServiceDialog state={{mode: 'edit', service: main.ServiceView.createFrom(alphaService)}} services={[]} onClose={vi.fn()} onSaved={vi.fn().mockResolvedValue(undefined)}/>);
    await user.click(screen.getByRole('button', {name: '从项目读取'}));
    expect((await screen.findByRole('textbox', {name: '进程 2 名称'}) as HTMLInputElement).value).toBe('PPT');
    await user.click(screen.getAllByLabelText('默认启动')[1]);
    await user.click(screen.getByRole('button', {name: '保存'}));
    await waitFor(() => expect(api.UpdateService).toHaveBeenCalledWith('alpha', expect.objectContaining({launchTargets: expect.arrayContaining([expect.objectContaining({id: 'ppt'})])})));
});

it('links process cards and log scope in both directions, including URLs and returning to all logs', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [project(), {...alphaService, id: 'beta', name: 'Beta'}], workspaces: []});
    api.GetLogs.mockResolvedValue([
        {serviceId: 'alpha', targetId: 'alpha::web', timestamp: '2026-11-25T00:00:00Z', stream: 'stdout', text: '[Web] web-only-output'},
        {serviceId: 'alpha', targetId: 'alpha::ppt', timestamp: '2026-11-25T00:00:01Z', stream: 'stdout', text: '[PPT] ppt-only-output'},
    ]);
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Monorepo 1'}));
    await screen.findByText('web-only-output');
    await user.click(screen.getByRole('button', {name: '查看 PPT 的日志'}));
    const filter = screen.getByRole('combobox', {name: '日志进程'});
    const logPane = within(screen.getByRole('region', {name: '服务日志'}));
    expect((filter as HTMLSelectElement).value).toBe('alpha::ppt');
    expect(screen.queryByText('web-only-output')).toBeNull();
    expect(screen.getByText('ppt-only-output')).toBeDefined();
    await user.click(logPane.getByTitle('打开 http://localhost:3930'));
    expect(api.OpenServiceURL).toHaveBeenCalledWith('alpha::ppt');
    await user.selectOptions(filter, 'alpha::web');
    expect(screen.getByRole('button', {name: '查看 Web 的日志'}).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('ppt-only-output')).toBeNull();
    expect(logPane.queryByTitle('打开 http://localhost:3930')).toBeNull();
    await user.selectOptions(filter, '');
    expect(screen.getByText('web-only-output')).toBeDefined();
    expect(screen.getByText('ppt-only-output')).toBeDefined();
    await user.click(screen.getByRole('button', {name: '查看 PPT 的日志'}));
    await user.click(screen.getByRole('button', {name: '全部日志'}));
    expect((filter as HTMLSelectElement).value).toBe('');
    await user.click(screen.getByRole('button', {name: '查看 PPT 的日志'}));
    await user.click(screen.getByRole('button', {name: '普通服务 1'}));
    await user.click(screen.getByRole('heading', {name: 'Beta'}));
    expect(screen.queryByRole('combobox', {name: '日志进程'})).toBeNull();
    await user.click(screen.getByRole('button', {name: 'Monorepo 1'}));
    expect((screen.getByRole('combobox', {name: '日志进程'}) as HTMLSelectElement).value).toBe('');
    await user.click(screen.getByRole('button', {name: '查看 PPT 的日志'}));
    const withoutPPT = project();
    withoutPPT.launchTargets = withoutPPT.launchTargets!.filter(target => target.id !== 'ppt');
    withoutPPT.targetViews = withoutPPT.targetViews!.filter(target => target.id !== 'alpha::ppt');
    api.GetAppState.mockResolvedValue({services: [withoutPPT], workspaces: []});
    await user.click(screen.getByRole('button', {name: '刷新状态'}));
    expect((screen.getByRole('combobox', {name: '日志进程'}) as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('button', {name: '查看 PPT 的日志'})).toBeNull();
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.SetDefaultLaunchTargets).not.toHaveBeenCalled();
});

it('surfaces an unavailable service even when its watcher process remains alive', async () => {
    const user = userEvent.setup();
    const service = project();
    service.targetViews![0].status = 'running';
    service.targetViews![1].status = 'running';
    service.targetViews![1].health = 'unreachable';
    render(<LaunchTargetPanel service={service} disabled={false} selectedTargetId="" onSelectTarget={vi.fn()}/>);
    const disclosure = screen.getByRole('button', {name: /2 \/ 2 个进程运行中\s*· 1 个不可用/});
    expect(disclosure).toBeDefined();
    await user.click(disclosure);
    expect(screen.getByText('地址不可达')).toBeDefined();
});
