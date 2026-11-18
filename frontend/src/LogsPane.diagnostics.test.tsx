import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it} from 'vitest';
import LogsPane from './components/LogsPane';
import {groupLogEntries} from './LogLine';
import {alphaService, api} from './testApi';
import type {LogEntry, ServiceView} from './types';

const service = {...alphaService, module: 'game', status: 'failed', buildCommand: 'build-default'} as ServiceView;
const logs = [
    ['system', '开始构建并导出 [Mac 中文]：build --mac --zh'],
    ['stdout', 'asset hashes: passed'],
    ['stdout', '169 audio cues, excluding 79 assets'],
    ['stderr', 'ERROR: missing import'],
    ['stderr', '  at scripts/main.gd:42'],
    ['stdout', 'cleaning temporary files'],
    ['system', '[Mac 中文] 构建并导出失败：进程已退出，退出码 1'],
].map(([stream, text], index) => ({serviceId: service.id, timestamp: `2026-11-18T18:11:${20 + index}+08:00`, stream, text})) as LogEntry[];

function pane(entries = logs, selectedService = service) {
    return <LogsPane service={selectedService} logs={entries} logBlocks={groupLogEntries(entries)} autoScroll onToggleAutoScroll={() => {}}
        downloadingLogs={false} onDownloadLogs={() => {}} onClearLogs={() => {}} scriptBusy={false} onRunScript={() => {}}
        onStopScript={() => {}} history={[]} onOpenURL={() => {}} onOpenGit={() => {}} module="game"/>;
}

it('renders the failure range and copies or exports the same repair context', async () => {
    const user = userEvent.setup();
    api.CopyRepairPrompt.mockResolvedValue(undefined);
    api.DownloadRepairPrompt.mockResolvedValue('/tmp/repair.md');
    const {container, rerender} = render(pane());
    expect(container.querySelectorAll('.in-failure')).toHaveLength(4);
    expect(container.querySelector('.failure-start')?.textContent).toContain('missing import');
    expect(container.querySelector('.failure-end')?.textContent).toContain('退出码 1');
    await user.click(screen.getByRole('button', {name: '复制修复 Prompt'}));
    await screen.findByText('已复制，粘贴给 Codex 或其他 agent 即可');
    const prompt = api.CopyRepairPrompt.mock.calls[0][0];
    expect(prompt).toContain('实际执行命令：build --mac --zh');
    expect(prompt).toContain('missing import');
    expect(prompt).toContain('目录：/tmp/alpha');
    await user.click(screen.getByRole('button', {name: '导出 Prompt'}));
    await waitFor(() => expect(api.DownloadRepairPrompt).toHaveBeenCalledWith(service.id, prompt));
    await screen.findByText('已导出到 /tmp/repair.md');
    rerender(pane([]));
    expect(screen.queryByRole('button', {name: '复制修复 Prompt'})).toBeNull();
});

it('reports copy failures and lets the user retry', async () => {
    const user = userEvent.setup();
    api.CopyRepairPrompt.mockRejectedValueOnce(new Error('剪贴板不可用')).mockResolvedValueOnce(undefined);
    render(pane());
    await user.click(screen.getByRole('button', {name: '复制修复 Prompt'}));
    await screen.findByText('剪贴板不可用');
    await user.click(screen.getByRole('button', {name: '复制修复 Prompt'}));
    await screen.findByText('已复制，粘贴给 Codex 或其他 agent 即可');
});

it('hides the repair action while logs still belong to the previously selected project', () => {
    render(pane(logs, {...service, id: 'another-project', directory: '/tmp/another'}));
    expect(screen.queryByRole('button', {name: '复制修复 Prompt'})).toBeNull();
});
