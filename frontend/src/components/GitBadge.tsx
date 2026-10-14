import {GitBranch} from 'lucide-react';
import type {GitStatus} from '../types';
import {gitBranch, gitCounts, gitStateLabel} from '../gitUtils';

export default function GitBadge({status, name, onOpen}: {status?: GitStatus; name: string; onOpen: () => void}) {
    const repository = status?.state === 'clean' || status?.state === 'dirty';
    const title = repository ? `${gitBranch(status)} · ${gitStateLabel(status)}\n${gitCounts(status)}\n仓库：${status.root}` : status?.error || gitStateLabel(status);
    return <button type="button" className={`git-badge git-${status?.state ?? 'pending'}`} aria-label={`查看 ${name} 的 Git 状态`}
        title={title} onClick={event => { event.stopPropagation(); onOpen(); }}>
        <GitBranch size={11}/>{repository && <span className="git-branch-name">{gitBranch(status)}</span>}
        <span className="git-state-text">{gitStateLabel(status)}</span>
    </button>;
}
