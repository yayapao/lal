import type {GitStatus} from './types';

export function canonicalGitConfigKey(key: string) {
    const parts = key.trim().split('.');
    return parts.map((part, index) => index === 0 || index === parts.length - 1 ? part.toLowerCase() : part).join('.');
}

export function gitBranch(status: GitStatus) {
    if (status.detached) return `HEAD · ${status.commit.slice(0, 8)}`;
    return status.branch + (status.unborn ? ' · 无提交' : '');
}

export function gitStateLabel(status?: GitStatus) {
    if (!status) return '检测中';
    if (status.state === 'clean') return '干净';
    if (status.state === 'dirty') return status.conflicts ? `${status.conflicts} 个冲突` : `${status.changed} 个变更`;
    if (status.state === 'not_repository') return '无 Git';
    return '探测失败';
}

export function gitCounts(status: GitStatus) {
    return [[status.staged, '已暂存'], [status.unstaged, '未暂存'], [status.untracked, '未跟踪'], [status.conflicts, '冲突']]
        .filter(([count]) => Number(count) > 0).map(([count, name]) => `${count} ${name}`).join(' · ');
}
