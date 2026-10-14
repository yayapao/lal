import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {main} from '../wailsjs/go/models';
import {alphaService} from './testApi';
import type {WorkspaceDraft} from './types';
import WorkspaceManagerDialog from './components/WorkspaceManagerDialog';

const projects = [
    main.ServiceView.createFrom({...alphaService, workspace: 'ViewAI'}),
    main.ServiceView.createFrom({...alphaService, id: 'beta', name: 'Beta', workspace: '', directory: '/tmp/beta'}),
    main.ServiceView.createFrom({...alphaService, id: 'gamma', name: 'Gamma', workspace: 'Star', directory: '/tmp/gamma'}),
];
const onSave = vi.fn();
const onClose = vi.fn();
function Harness({saving = false, error = ''}: {saving?: boolean; error?: string}) {
    const [draft, setDraft] = useState<WorkspaceDraft>({workspaces: ['ViewAI', 'Star'], assignments: {alpha: 'ViewAI', beta: '', gamma: 'Star'}});
    return <WorkspaceManagerDialog services={projects} draft={draft} saving={saving} error={error} onChange={setDraft} onClose={onClose} onSave={() => onSave(draft)}/>;
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it('shows only the selected workspace members without icons or per-project text fields', () => {
    const {container} = render(<Harness/>);
    expect(screen.getByRole('heading', {name: 'ViewAI'})).toBeDefined();
    expect(screen.getByRole('checkbox', {name: '选择项目 Alpha'})).toBeDefined();
    expect(screen.queryByRole('checkbox', {name: '选择项目 Beta'})).toBeNull();
    expect(container.querySelector('svg, label')).toBeNull();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
});

it('adds selected projects with their current ownership shown', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    await user.click(screen.getByRole('button', {name: '添加项目'}));
    expect(screen.getByRole('heading', {name: '添加到 ViewAI'})).toBeDefined();
    expect(within(screen.getByRole('region', {name: '项目归属'})).getByText('未分组')).toBeDefined();
    await user.click(screen.getByRole('checkbox', {name: '选择项目 Beta'}));
    await user.click(screen.getByRole('button', {name: '添加选中项目'}));
    expect(screen.getByRole('checkbox', {name: '选择项目 Beta'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(onSave).toHaveBeenCalledWith({workspaces: ['ViewAI', 'Star'], assignments: {alpha: 'ViewAI', beta: 'ViewAI', gamma: 'Star'}});
});

it('moves selected projects in a batch without changing other memberships', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    await user.click(screen.getByRole('checkbox', {name: '选择项目 Alpha'}));
    await user.selectOptions(screen.getByRole('combobox', {name: '移动到 Workspace'}), JSON.stringify('Star'));
    await user.click(screen.getByRole('button', {name: '移动'}));
    await user.click(screen.getByRole('button', {name: '查看 Star'}));
    expect(screen.getByRole('checkbox', {name: '选择项目 Alpha'})).toBeDefined();
    expect(screen.getByRole('checkbox', {name: '选择项目 Gamma'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({assignments: {alpha: 'Star', beta: '', gamma: 'Star'}}));
});

it('creates an empty workspace with a usable default name and saves it', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    await user.click(screen.getByRole('button', {name: '新增 Workspace'}));
    expect((screen.getByRole('textbox', {name: '新 Workspace 名称'}) as HTMLInputElement).value).toBe('Workspace 1');
    await user.click(screen.getByRole('button', {name: '创建'}));
    expect(screen.getByRole('heading', {name: 'Workspace 1'})).toBeDefined();
    expect(screen.getByText('此 Workspace 还没有项目')).toBeDefined();
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({workspaces: ['ViewAI', 'Star', 'Workspace 1']}));
});

it('requires a delete choice and returns all members to unassigned', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    await user.click(screen.getByRole('button', {name: '删除'}));
    expect(screen.getByRole('alert').textContent).toContain('1 个项目将移到未分组');
    expect(screen.getByRole('checkbox', {name: '选择项目 Alpha'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '确认删除'}));
    expect(screen.queryByRole('button', {name: '查看 ViewAI'})).toBeNull();
    expect(screen.getByRole('heading', {name: '未分组'})).toBeDefined();
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(onSave).toHaveBeenCalledWith({workspaces: ['Star'], assignments: {alpha: '', beta: '', gamma: 'Star'}});
});

it('renames a workspace and its memberships together, rejecting duplicate names', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    await user.click(screen.getByRole('button', {name: '重命名'}));
    fireEvent.change(screen.getByRole('textbox', {name: 'Workspace 名称'}), {target: {value: 'Star'}});
    await user.click(screen.getByRole('button', {name: '确定'}));
    expect(screen.getByRole('alert').textContent).toContain('已存在');
    fireEvent.change(screen.getByRole('textbox', {name: 'Workspace 名称'}), {target: {value: 'Huya'}});
    await user.click(screen.getByRole('button', {name: '确定'}));
    await user.click(screen.getByRole('button', {name: '保存'}));
    expect(onSave).toHaveBeenCalledWith({workspaces: ['Huya', 'Star'], assignments: {alpha: 'Huya', beta: '', gamma: 'Star'}});
});

it('disables edits and dismissal while saving and displays save errors inline', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<Harness saving/>);
    await user.click(screen.getByRole('button', {name: '关闭'}));
    await user.click(screen.getByRole('button', {name: '新增 Workspace'}));
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', {name: '新 Workspace 名称'})).toBeNull();
    rerender(<Harness error="保存失败，请重试"/>);
    expect(screen.getByRole('alert').textContent).toBe('保存失败，请重试');
    fireEvent.keyDown(window, {key: 'Escape'});
    expect(onClose).toHaveBeenCalledTimes(1);
});
