import {ChevronRight, Folder} from 'lucide-react';
import {useId} from 'react';
import type {ReactNode} from 'react';
import type {ResourceUsage, WorkspaceGroup} from '../types';
import {formatCPU, formatMemory, isActive, serviceVisualState} from '../utils';

export default function WorkspaceGroupSection({group, collapsed, checkedIds, resourceUsage, onToggle, children}: {
    group: WorkspaceGroup;
    collapsed: boolean;
    checkedIds: Set<string>;
    resourceUsage: Record<string, ResourceUsage>;
    onToggle: () => void;
    children: ReactNode;
}) {
    const contentId = useId();
    const active = group.services.filter(isActive);
    const ready = group.services.filter(service => serviceVisualState(service) === 'ready' || (service.port?.accessible && !service.port.previewOnly)).length;
    const issues = group.services.filter(service => ['failed', 'unreachable', 'invalid', 'conflict'].includes(serviceVisualState(service)));
    const checked = group.services.filter(service => checkedIds.has(service.id)).length;
    const samples = active.map(service => resourceUsage[service.id]).filter((usage): usage is ResourceUsage => Boolean(usage));
    const hasResources = active.length > 0 && samples.length === active.length;
    const cpu = samples.reduce((total, usage) => total + usage.cpuPercent, 0);
    const memory = samples.reduce((total, usage) => total + usage.memoryBytes, 0);
    const issueTitle = issues.map(service => `${service.name}：${!service.pathExists ? '路径失效' : service.lastError || service.healthInfo || '异常'}`).join('\n');

    return <div className="workspace-group">
        <button className={`workspace-heading${issues.length > 0 ? ' has-issues' : ''}`} type="button" onClick={onToggle}
            aria-expanded={!collapsed} aria-controls={contentId} aria-label={`${collapsed ? '展开' : '收起'} ${group.name}`}
            title={`${collapsed ? '展开' : '收起'} ${group.name}`}>
            <span className="workspace-heading-main">
                <ChevronRight className="workspace-chevron" size={12}/><span className="workspace-folder"><Folder size={13}/></span>
                <span className="workspace-name" title={group.name}>{group.name}</span>
                {checked > 0 && <span className="workspace-selected-count">已选 {checked}</span>}
                <span className="workspace-service-count">{group.services.length} 个服务</span>
            </span>
            <span className="workspace-summary">
                <span className={active.length > 0 ? 'workspace-running' : ''}>运行 <strong>{active.length}</strong></span>
                <span className={ready > 0 ? 'workspace-ready' : ''}>可访问 <strong>{ready}</strong></span>
                <span className={issues.length > 0 ? 'workspace-issues' : ''} title={issueTitle}>异常 <strong>{issues.length}</strong></span>
                {collapsed && hasResources && <>
                    <span className="workspace-cpu">CPU <strong>{formatCPU(cpu)}</strong></span>
                    <span className="workspace-memory">MEM <strong>{formatMemory(memory)}</strong></span>
                </>}
            </span>
        </button>
        <div className="workspace-group-content" id={contentId} hidden={collapsed}>{children}</div>
    </div>;
}
