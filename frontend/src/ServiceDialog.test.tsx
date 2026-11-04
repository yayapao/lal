import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {alphaService, api} from './testApi';
import * as main from '../wailsjs/lal/internal/launcher/models';
import ServiceDialog from './components/ServiceDialog';

vi.mock('../wailsjs/lal/app', () => api);

const project = {
    directory: '/tmp/niu', name: 'niu', workspace: 'Studio', projectType: 'nextjs',
    command: 'pnpm run dev', url: 'http://localhost:35790', cleanCommand: 'pnpm run clean',
    scripts: [
        {name: 'dev', command: 'pnpm run dev', preview: 'next dev --port 35790', url: 'http://localhost:35790'},
        {name: 'start', command: 'pnpm run start', preview: 'next start --port 4000', url: 'http://localhost:4000'},
    ], sources: ['package.json'], warnings: [],
};
const onSaved = vi.fn().mockResolvedValue(undefined);
const onClose = vi.fn();

function createDialog() {
    return render(<ServiceDialog state={{mode: 'create', module: 'service'}} services={[
        main.ServiceView.createFrom({...alphaService, workspace: 'Studio'}),
        main.ServiceView.createFrom({...alphaService, id: 'beta', workspace: 'Studio'}),
    ]} onClose={onClose} onSaved={onSaved}/>);
}

async function chooseDirectory() {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: '选择目录'}));
    await waitFor(() => expect((screen.getByRole('textbox', {name: '服务名称'}) as HTMLInputElement).value).toBe('niu'));
    return user;
}

beforeEach(() => {
    vi.clearAllMocks();
    api.DetectProject.mockReset().mockResolvedValue(project);
    api.ChooseDirectory.mockReset().mockResolvedValue('/tmp/niu');
    api.CreateService.mockResolvedValue({...alphaService, name: 'niu'});
});
afterEach(cleanup);

it('offers saved workspaces even when they do not have any projects', () => {
    render(<ServiceDialog state={{mode: 'create', module: 'service'}} services={[]} workspaces={['Empty']} onClose={onClose} onSaved={onSaved}/>);
    expect(screen.getByRole('option', {name: 'Empty'})).toBeDefined();
});

it('starts with the directory and fills project settings before saving a selected workspace', async () => {
    createDialog();
    expect(document.activeElement).toBe(screen.getByRole('textbox', {name: '项目目录'}));
    const user = await chooseDirectory();
    expect(api.DetectProject).toHaveBeenCalledWith('/tmp/niu');
    expect((screen.getByRole('textbox', {name: '启动命令'}) as HTMLInputElement).value).toBe('pnpm run dev');
    expect((screen.getByLabelText(/访问地址/) as HTMLInputElement).value).toBe('http://localhost:35790');
    expect((screen.getByRole('combobox', {name: 'Workspace'}) as HTMLSelectElement).value).toBe('Studio');
    expect(screen.getAllByRole('option', {name: 'Studio'})).toHaveLength(1);
    await user.selectOptions(screen.getByRole('combobox', {name: 'Workspace'}), 'Studio');
    await user.click(screen.getByRole('button', {name: '添加服务'}));
    expect(api.CreateService).toHaveBeenCalledWith({
        name: 'niu', module: 'service', workspace: 'Studio', directory: '/tmp/niu', command: 'pnpm run dev',
        url: 'http://localhost:35790', cleanCommand: 'pnpm run clean',
    });
    expect(onSaved).toHaveBeenCalled();
});

it('updates the suggested URL with the selected script and preserves a manually entered URL', async () => {
    createDialog();
    const user = await chooseDirectory();
    await user.selectOptions(screen.getByRole('combobox', {name: '项目启动脚本'}), 'pnpm run start');
    expect((screen.getByLabelText(/访问地址/) as HTMLInputElement).value).toBe('http://localhost:4000');
    fireEvent.change(screen.getByLabelText(/访问地址/), {target: {value: 'http://127.0.0.1:8888'}});
    await user.selectOptions(screen.getByRole('combobox', {name: '项目启动脚本'}), 'pnpm run dev');
    expect((screen.getByLabelText(/访问地址/) as HTMLInputElement).value).toBe('http://127.0.0.1:8888');
});

it('preserves edits made while project detection is pending', async () => {
    let finish!: (value: typeof project) => void;
    api.DetectProject.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    createDialog();
    await userEvent.setup().click(screen.getByRole('button', {name: '选择目录'}));
    await waitFor(() => expect(api.DetectProject).toHaveBeenCalled());
    fireEvent.change(screen.getByRole('textbox', {name: '服务名称'}), {target: {value: '我的服务'}});
    fireEvent.change(screen.getByRole('textbox', {name: '启动命令'}), {target: {value: 'npm run custom'}});
    expect((screen.getByRole('button', {name: '添加服务'}) as HTMLButtonElement).disabled).toBe(true);
    finish(project);
    await screen.findByText(/已读取 package.json/);
    expect((screen.getByRole('textbox', {name: '服务名称'}) as HTMLInputElement).value).toBe('我的服务');
    expect((screen.getByRole('textbox', {name: '启动命令'}) as HTMLInputElement).value).toBe('npm run custom');
    expect((screen.getByLabelText(/访问地址/) as HTMLInputElement).value).toBe('');
});

it('ignores a stale result after the project directory changes', async () => {
    let finishFirst!: (value: typeof project) => void;
    api.DetectProject.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
        .mockResolvedValueOnce({...project, directory: '/tmp/second', name: 'second'});
    createDialog();
    await userEvent.setup().click(screen.getByRole('button', {name: '选择目录'}));
    await waitFor(() => expect(api.DetectProject).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('textbox', {name: '项目目录'}), {target: {value: '/tmp/second'}});
    await waitFor(() => expect((screen.getByRole('textbox', {name: '服务名称'}) as HTMLInputElement).value).toBe('second'));
    finishFirst(project);
    await waitFor(() => expect((screen.getByRole('textbox', {name: '服务名称'}) as HTMLInputElement).value).toBe('second'));
    expect((screen.getByRole('textbox', {name: '项目目录'}) as HTMLInputElement).value).toBe('/tmp/second');
});

it('keeps configured fields and unassigned membership when editing an existing service', async () => {
    render(<ServiceDialog state={{mode: 'edit', service: main.ServiceView.createFrom({...alphaService, workspace: 'Studio', configuredWorkspace: ''})}}
        services={[main.ServiceView.createFrom({...alphaService, workspace: 'Studio'})]} onClose={onClose} onSaved={onSaved}/>);
    expect((screen.getByRole('combobox', {name: 'Workspace'}) as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByRole('textbox', {name: '服务名称'}), {target: {value: 'Updated'}});
    await userEvent.setup().click(screen.getByRole('button', {name: '保存'}));
    expect(api.DetectProject).not.toHaveBeenCalled();
    expect(api.UpdateService).toHaveBeenCalledWith('alpha', expect.objectContaining({name: 'Updated', workspace: ''}));
});

it('allows manual configuration after detection fails and keeps directory cancellation harmless', async () => {
    api.DetectProject.mockRejectedValueOnce(new Error('无法读取项目'));
    createDialog();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: '选择目录'}));
    await screen.findByText(/无法读取项目/);
    fireEvent.change(screen.getByRole('textbox', {name: '服务名称'}), {target: {value: 'Manual'}});
    fireEvent.change(screen.getByRole('textbox', {name: '启动命令'}), {target: {value: 'go run .'}});
    api.ChooseDirectory.mockResolvedValueOnce('');
    await user.click(screen.getByRole('button', {name: '选择目录'}));
    expect((screen.getByRole('textbox', {name: '服务名称'}) as HTMLInputElement).value).toBe('Manual');
    await user.click(screen.getByRole('button', {name: '添加服务'}));
    expect(api.CreateService).toHaveBeenCalledWith(expect.objectContaining({name: 'Manual', command: 'go run .'}));
});

it('keeps the form usable when the same directory is selected again', async () => {
    createDialog();
    const user = await chooseDirectory();
    await user.click(screen.getByRole('button', {name: '选择目录'}));
    expect((screen.getByRole('button', {name: '添加服务'}) as HTMLButtonElement).disabled).toBe(false);
    expect(api.DetectProject).toHaveBeenCalledTimes(1);
});

it('replaces project-specific script selections when switching directories', async () => {
    createDialog();
    const user = await chooseDirectory();
    await user.selectOptions(screen.getByRole('combobox', {name: '项目启动脚本'}), 'pnpm run start');
    api.DetectProject.mockResolvedValueOnce({...project, directory: '/tmp/second', name: 'second', command: 'bun run dev', url: 'http://localhost:5678'});
    fireEvent.change(screen.getByRole('textbox', {name: '项目目录'}), {target: {value: '/tmp/second'}});
    await waitFor(() => expect((screen.getByRole('textbox', {name: '启动命令'}) as HTMLInputElement).value).toBe('bun run dev'));
    expect((screen.getByLabelText(/访问地址/) as HTMLInputElement).value).toBe('http://localhost:5678');
});

it('clears old generated settings if a different project cannot be parsed', async () => {
    createDialog();
    await chooseDirectory();
    api.DetectProject.mockRejectedValueOnce(new Error('项目不存在'));
    fireEvent.change(screen.getByRole('textbox', {name: '项目目录'}), {target: {value: '/tmp/missing'}});
    await screen.findByText(/项目不存在/);
    expect((screen.getByRole('textbox', {name: '服务名称'}) as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('textbox', {name: '启动命令'}) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/访问地址/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/缓存清理脚本/) as HTMLTextAreaElement).value).toBe('rm -rf .next');
});
