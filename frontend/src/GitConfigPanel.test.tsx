import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {main} from '../wailsjs/go/models';
import {alphaService, api} from './testApi';
import GitConfigPanel from './components/GitConfigPanel';

vi.mock('../wailsjs/go/main/App', () => api);
const service = main.ServiceView.createFrom(alphaService);
const details = main.GitDetails.createFrom({
    status: {serviceId: 'alpha', directory: '/tmp/alpha', root: '/tmp/alpha', state: 'clean'}, configError: '', files: [],
    config: [{key: 'user.name', value: 'Yango'}, {key: 'lal.multiple', value: 'same'}, {key: 'lal.multiple', value: 'same'}, {key: 'lal.multiple', value: 'line1\nline2'}],
});
const onSaved = vi.fn().mockResolvedValue(undefined);
const onEditingChange = vi.fn();
const panel = (data = details) => <GitConfigPanel service={service} details={data} onSaved={onSaved} onEditingChange={onEditingChange}/>;

beforeEach(() => { vi.clearAllMocks(); api.UpdateGitConfig.mockResolvedValue(undefined); });
afterEach(cleanup);

it('quickly edits identity and rereads the configuration after saving', async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', {name: '用户名'}));
    expect(screen.getByRole('textbox', {name: 'Git 配置键'})).toHaveProperty('readOnly', true);
    const value = screen.getByRole('textbox', {name: '配置值'});
    await user.clear(value);
    await user.type(value, 'New Name');
    await user.click(screen.getByRole('button', {name: '保存配置'}));

    await waitFor(() => expect(api.UpdateGitConfig).toHaveBeenCalledWith('alpha', {
        directory: '/tmp/alpha', root: '/tmp/alpha', key: 'user.name', expectedValues: ['Yango'], values: ['New Name'],
    }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'user.name 已保存');
    expect(screen.queryByRole('textbox', {name: '配置值'})).toBeNull();
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
});

it('adds a missing email with the local scope and preserves empty values', async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', {name: '邮箱'}));
    await user.click(screen.getByRole('button', {name: '保存配置'}));
    await waitFor(() => expect(api.UpdateGitConfig).toHaveBeenCalledWith('alpha', {
        directory: '/tmp/alpha', root: '/tmp/alpha', key: 'user.email', expectedValues: [], values: [''],
    }));
});

it('preserves the draft and original duplicate values through background updates', async () => {
    const user = userEvent.setup();
    const {rerender} = render(panel());
    await user.click(screen.getAllByRole('button', {name: '编辑 lal.multiple'})[0]);
    await user.clear(screen.getByRole('textbox', {name: '配置值 2'}));
    await user.type(screen.getByRole('textbox', {name: '配置值 2'}), 'changed');
    rerender(panel(main.GitDetails.createFrom({...details, config: [...details.config, {key: 'user.email', value: 'external@example.test'}]})));
    expect(screen.getByRole('textbox', {name: '配置值 2'})).toHaveProperty('value', 'changed');
    await user.click(screen.getByRole('button', {name: '保存配置'}));
    await waitFor(() => expect(api.UpdateGitConfig).toHaveBeenCalledWith('alpha', {
        directory: '/tmp/alpha', root: '/tmp/alpha', key: 'lal.multiple', expectedValues: ['same', 'same', 'line1\nline2'], values: ['same', 'changed', 'line1\nline2'],
    }));
});

it('confirms deletion and retains the form when the backend reports an external edit', async () => {
    const user = userEvent.setup();
    render(panel());
    await user.click(screen.getByRole('button', {name: '用户名'}));
    await user.click(screen.getByRole('button', {name: '删除配置'}));
    expect(api.UpdateGitConfig).not.toHaveBeenCalled();
    api.UpdateGitConfig.mockRejectedValueOnce('user.name 已被其他程序修改，请重新读取后编辑');
    await user.click(screen.getByRole('button', {name: '确认删除'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'user.name 已被其他程序修改，请重新读取后编辑');
    expect(screen.getByRole('textbox', {name: '配置值'})).toHaveProperty('value', 'Yango');
    expect(onSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: '确认删除'}));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(api.UpdateGitConfig).toHaveBeenLastCalledWith('alpha', {
        directory: '/tmp/alpha', root: '/tmp/alpha', key: 'user.name', expectedValues: ['Yango'], values: [],
    });
});

it('prevents duplicate submissions and cancels drafts without writing', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    api.UpdateGitConfig.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(panel());
    await user.click(screen.getByRole('button', {name: '新增配置'}));
    await user.type(screen.getByRole('textbox', {name: 'Git 配置键'}), 'user.email');
    await user.type(screen.getByRole('textbox', {name: '配置值'}), 'new@example.test');
    await user.dblClick(screen.getByRole('button', {name: '保存配置'}));
    expect(api.UpdateGitConfig).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {name: '取消'})).toHaveProperty('disabled', true);
    await act(async () => resolve());
    await user.click(screen.getByRole('button', {name: '用户名'}));
    await user.click(screen.getByRole('button', {name: '取消'}));
    expect(api.UpdateGitConfig).toHaveBeenCalledTimes(1);
});
