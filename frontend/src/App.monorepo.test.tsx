import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import {alphaService, api} from './testApi';
import App from './App';

const project = (id: string, name: string, workspace = 'Product') => ({...alphaService, id, name, workspace,
    launchTargets: [{id: 'web', name: `${name} Web`, command: 'npm run web', default: true},
        {id: 'worker', name: `${name} Worker`, command: 'npm run worker', default: false}],
    targetViews: [{...alphaService, id: `${id}::web`}, {...alphaService, id: `${id}::worker`}],
});

it('opens flat process management from the overview and clears hidden batch selections', async () => {
    const user = userEvent.setup();
    api.GetAppState.mockResolvedValue({services: [project('mono', 'Mono'), alphaService]});
    const {container} = render(<App/>);
    await user.click(await screen.findByRole('checkbox', {name: '选择 Alpha'}));
    expect(screen.getAllByText('已选 1').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', {name: '查看 Mono Web 的日志'})).toBeNull();
    await user.click(screen.getByRole('button', {name: '管理 Mono 的应用进程'}));
    expect(screen.getByRole('button', {name: 'Monorepo 1'}).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', {name: '查看 Mono Web 的日志'})).toBeDefined();
    expect(screen.getByRole('button', {name: '查看 Mono Worker 的日志'})).toBeDefined();
    expect(container.querySelector('.monorepo-pane .workspace-group')).toBeNull();
    expect(container.querySelector('.monorepo-pane .service-row')).toBeNull();
    expect(screen.queryByRole('button', {name: /个进程运行中/})).toBeNull();
    await user.click(screen.getByRole('button', {name: '全部服务 2'}));
    expect((screen.getByRole('checkbox', {name: '选择 Alpha'}) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryAllByText('已选 1')).toHaveLength(0);
    expect(api.StartService).not.toHaveBeenCalled();
    expect(api.StopService).not.toHaveBeenCalled();
});

it('switches projects, scopes project controls and errors, and follows search and project removal', async () => {
    const user = userEvent.setup();
    const one = project('one', 'One');
    const two = {...project('two', 'Two', 'Other'), status: 'running'};
    api.GetAppState.mockResolvedValue({services: [alphaService, one, two]});
    render(<App/>);
    await user.click(await screen.findByRole('button', {name: 'Monorepo 2'}));
    await user.click(screen.getByRole('button', {name: '查看 One Web 的日志'}));
    expect((screen.getByRole('combobox', {name: '日志进程'}) as HTMLSelectElement).value).toBe('one::web');
    const switcher = screen.getByRole('combobox', {name: 'Monorepo 项目'});
    await user.selectOptions(switcher, 'two');
    expect((screen.getByRole('combobox', {name: '日志进程'}) as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('button', {name: '查看 One Web 的日志'})).toBeNull();
    await user.click(screen.getByLabelText('Two 项目操作'));
    await user.click(screen.getByRole('button', {name: '启动默认'}));
    expect(api.StartService).toHaveBeenCalledWith('two');
    api.StopService.mockRejectedValueOnce(new Error('停止被拒绝'));
    await user.click(screen.getByLabelText('Two 项目操作'));
    await user.click(screen.getByRole('button', {name: '停止项目'}));
    expect(api.StopService).toHaveBeenCalledWith('two');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '停止被拒绝');
    await user.selectOptions(switcher, 'one');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.StartAll).not.toHaveBeenCalled();
    expect(api.StopAll).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', {name: '搜索服务'}), 'Two');
    await waitFor(() => expect(switcher).toHaveProperty('value', 'two'));
    expect((screen.getByRole('combobox', {name: '日志进程'}) as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('button', {name: 'Monorepo 2'})).toBeDefined();
    await user.clear(screen.getByRole('textbox', {name: '搜索服务'}));
    api.GetAppState.mockResolvedValue({services: [alphaService, one]});
    await user.click(screen.getByRole('button', {name: '刷新状态'}));
    await waitFor(() => expect(switcher).toHaveProperty('value', 'one'));
    expect((screen.getByRole('combobox', {name: '日志进程'}) as HTMLSelectElement).value).toBe('');
    await user.type(screen.getByRole('textbox', {name: '搜索服务'}), 'missing');
    expect(screen.getByText('没有匹配的 Monorepo 项目')).toBeDefined();
    await user.clear(screen.getByRole('textbox', {name: '搜索服务'}));
    expect(screen.getByRole('button', {name: '查看 One Web 的日志'})).toBeDefined();
});
