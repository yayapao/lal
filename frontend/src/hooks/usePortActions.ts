import {StopExternalAndStart} from '../../wailsjs/lal/app';
import type {OperationIssue, ServiceView} from '../types';

export function portActionLabel(service: ServiceView) {
    if (!service.port || service.port.previewOnly || ['running', 'starting', 'stopping'].includes(service.status)) return '';
    return service.port.matchesProject ? '处理外部服务' : '处理端口冲突';
}

export function requestPortAction(service: ServiceView, showIssue: (issue: OperationIssue | null) => void,
    edit: () => void, refresh: () => Promise<void>, toast: (message: string) => void) {
    const port = service.port;
    if (!port || port.previewOnly || ['running', 'starting', 'stopping'].includes(service.status)) return false;
    showIssue({
        title: `${service.name} · ${port.matchesProject ? '外部运行' : '端口冲突'}`,
        message: `PID ${port.pid}\n${port.command}\n目录：${port.directory || '无法确认'}\n\n${port.matchesProject
            ? `此进程的工作目录与当前项目相同，但无法仅凭目录确认启动用途。确认后将停止此进程，再执行配置中的启动命令。启动命令：\n${service.command}\n\n原进程日志无法补录；若有后台工具自动拉起进程，需要先在原工具中停止。`
            : '占用进程不属于当前项目，或无法确认归属。请修改启动命令和访问地址，或在原工具中停止占用进程。'}`,
        actionLabel: port.matchesProject ? '停止外部服务并由 LAL 启动' : '编辑配置',
        onAction: async () => {
            if (!port.matchesProject) { showIssue(null); edit(); return; }
            try {
                await StopExternalAndStart(service.id, port.pid, port.identity);
                showIssue(null); toast(`${service.name} 已由 LAL 启动`);
            } finally { await refresh(); }
        },
    });
    return true;
}
