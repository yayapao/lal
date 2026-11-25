import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import * as main from '../wailsjs/lal/internal/launcher/models';
import LaunchTargetPanel from './components/LaunchTargetPanel';
import ServiceDialog from './components/ServiceDialog';
import LogsPane from './components/LogsPane';

const targets = [
    {id: 'web', name: 'Web', command: 'npm run dev:web', url: '', default: true},
    {id: 'ppt', name: 'PPT', command: 'npm run dev:ppt', url: 'http://localhost:3930', default: false},
];
const project = () => main.ServiceView.createFrom({...alphaService, launchTargets: targets,
    targetViews: targets.map(target => ({...alphaService, ...target, id: `alpha::${target.id}`}))});

it('starts an explicit selection, saves defaults separately, and controls a single process', async () => {
    const user = userEvent.setup();
    render(<LaunchTargetPanel service={project()} disabled={false}/>);
    await user.click(screen.getByRole('button', {name: '0 / 2 个进程运行中'}));
    await user.click(screen.getByRole('checkbox', {name: '选择进程 Web'}));
    await user.click(screen.getByRole('checkbox', {name: '选择进程 PPT'}));
    await user.click(screen.getByRole('button', {name: '启动所选'}));
    expect(api.StartLaunchTargets).toHaveBeenCalledWith('alpha', ['ppt']);
    expect(api.SetDefaultLaunchTargets).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: '设为默认'}));
    expect(api.SetDefaultLaunchTargets).toHaveBeenCalledWith('alpha', ['ppt']);
    await user.click(screen.getByRole('button', {name: '启动进程 PPT'}));
    expect(api.StartService).toHaveBeenCalledWith('alpha::ppt');
    expect(api.StopService).not.toHaveBeenCalled();
});

it('keeps a temporary selection across status refresh and shows failures', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<LaunchTargetPanel service={project()} disabled={false}/>);
    await user.click(screen.getByRole('button', {name: '0 / 2 个进程运行中'}));
    await user.click(screen.getByRole('checkbox', {name: '选择进程 PPT'}));
    const running = project();
    running.targetViews![0].status = 'running';
    rerender(<LaunchTargetPanel service={running} disabled={false}/>);
    expect((screen.getByRole('checkbox', {name: '选择进程 PPT'}) as HTMLInputElement).checked).toBe(true);
    api.StopService.mockRejectedValueOnce(new Error('停止失败'));
    await user.click(screen.getByRole('button', {name: '停止进程 Web'}));
    expect((await screen.findByRole('alert')).textContent).toContain('停止失败');
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

it('filters aggregate logs by process', async () => {
    const user = userEvent.setup();
    const logs = [
        {serviceId: 'alpha', targetId: 'alpha::web', timestamp: '2026-11-25T00:00:00Z', stream: 'stdout', text: '[Web] web-only-output'},
        {serviceId: 'alpha', targetId: 'alpha::ppt', timestamp: '2026-11-25T00:00:01Z', stream: 'stdout', text: '[PPT] ppt-only-output'},
    ];
    render(<LogsPane service={project()} logs={logs} logBlocks={logs} autoScroll={false} onToggleAutoScroll={vi.fn()} downloadingLogs={false} onDownloadLogs={vi.fn()} onClearLogs={vi.fn()} scriptBusy={false} onRunScript={vi.fn()} onStopScript={vi.fn()} history={[]} onOpenURL={vi.fn()} onOpenGit={vi.fn()}/>);
    await user.selectOptions(screen.getByRole('combobox', {name: '日志进程'}), 'alpha::ppt');
    expect(screen.queryByText('web-only-output')).toBeNull();
    expect(screen.getByText('ppt-only-output')).toBeDefined();
});
