import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';
import * as main from '../wailsjs/lal/internal/launcher/models';
import {alphaService, api} from './testApi';
import App from './App';
import DefaultLaunchTargetsDialog from './components/DefaultLaunchTargetsDialog';

const project = () => main.ServiceView.createFrom({...alphaService, id: 'mono', name: 'Monorepo', status: 'running',
    launchTargets: [{id: 'web', name: 'Web', command: 'npm run web', default: true},
        {id: 'ppt', name: 'PPT', command: 'npm run ppt', default: false},
        {id: 'worker', name: 'Worker', command: 'npm run worker', default: false}],
    targetViews: [{...alphaService, id: 'mono::web', status: 'running'}, {...alphaService, id: 'mono::ppt'}, {...alphaService, id: 'mono::worker'}],
});

it('saves multiple defaults while running and uses the saved combination for the next default launch', async () => {
    const user = userEvent.setup();
    let current = project();
    api.GetAppState.mockResolvedValue({services: [current]});
    api.SetDefaultLaunchTargets.mockImplementation(async (_id, ids: string[]) => {
        current = {...current, launchTargets: current.launchTargets!.map(target => ({...target, default: ids.includes(target.id)}))};
        api.GetAppState.mockResolvedValue({services: [current]});
        return current;
    });
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Monorepo 1'}));
    await user.click(screen.getByLabelText('Monorepo 项目操作'));
    await user.click(screen.getByRole('button', {name: '配置默认启动'}));
    const dialog = within(screen.getByRole('dialog', {name: '默认启动'}));
    expect(dialog.getByRole('checkbox', {name: 'Web'})).toHaveProperty('checked', true);
    await user.click(dialog.getByRole('checkbox', {name: 'PPT'}));
    expect(dialog.getByRole('checkbox', {name: 'Worker'})).toHaveProperty('checked', false);
    await user.click(dialog.getByRole('button', {name: '保存'}));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.SetDefaultLaunchTargets).toHaveBeenCalledWith('mono', ['web', 'ppt']);
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.StopService).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText('Monorepo 项目操作'));
    expect(screen.getByRole('button', {name: '启动默认'}).title).toBe('启动 Web、PPT');
    await user.click(screen.getByRole('button', {name: '启动默认'}));
    expect(api.StartService).toHaveBeenCalledWith('mono');
    await user.click(screen.getByLabelText('Monorepo 项目操作'));
    await user.click(screen.getByRole('button', {name: '配置默认启动'}));
    expect(screen.getByRole('checkbox', {name: 'PPT'})).toHaveProperty('checked', true);
    await user.click(screen.getByRole('checkbox', {name: 'PPT'}));
    await user.click(screen.getByRole('button', {name: '取消'}));
    expect(api.SetDefaultLaunchTargets).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByLabelText('Monorepo 项目操作'));
});

it('keeps choices after save failure, blocks dismissal while saving, and can clear all defaults', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn(), onSaved = vi.fn();
    let rejectSave!: (error: Error) => void;
    api.SetDefaultLaunchTargets.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSave = reject; })).mockResolvedValue(project());
    render(<DefaultLaunchTargetsDialog service={project()} onClose={onClose} onSaved={onSaved}/>);
    await user.click(screen.getByRole('checkbox', {name: 'PPT'}));
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(screen.getByRole('checkbox', {name: 'PPT'}).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', {name: '保存'})).toHaveProperty('disabled', true);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    rejectSave(new Error('写入失败'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '写入失败');
    expect(screen.getByRole('checkbox', {name: 'PPT'})).toHaveProperty('checked', true);
    await user.click(screen.getByRole('checkbox', {name: 'Web'}));
    await user.click(screen.getByRole('checkbox', {name: 'PPT'}));
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(api.SetDefaultLaunchTargets).toHaveBeenLastCalledWith('mono', []);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.StopService).not.toHaveBeenCalled();
});
