import type {ServiceView} from '../types';
import {serviceVisualState} from '../utils';

export default function StatusLabel({service, compact = false}: {service: ServiceView; compact?: boolean}) {
    let state = serviceVisualState(service);
    let label = ({running: '运行中', starting: '启动中', stopping: '停止中', failed: '异常', stopped: '已停止', invalid: '路径失效'} as Record<string, string>)[state] ?? '已停止';
    if (state === 'ready') label = '可访问';
    if (state === 'checking') label = '等待端口';
    if (state === 'unreachable') label = '地址不可达';
    return <span className={`status-label state-${state} ${compact ? 'is-compact' : ''}`} title={service.healthInfo || label}><span className="status-dot"/>{label}</span>;
}
