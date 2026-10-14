import {ArrowLeft, GitBranch, LoaderCircle, RefreshCw} from 'lucide-react';
import {useState} from 'react';
import type {GitStatus, ServiceView} from '../types';
import {gitBranch, gitCounts, gitStateLabel} from '../gitUtils';
import {useGitDetails} from '../hooks/useGitDetails';

export default function GitPane({service, refreshKey, onStatus, onBack}: {
    service: ServiceView; refreshKey: number; onStatus: (status: GitStatus) => void; onBack: () => void;
}) {
    const {details, loading, error, refresh} = useGitDetails(service, refreshKey, onStatus);
    const [tab, setTab] = useState<'files' | 'config'>('files');
    const [query, setQuery] = useState('');
    const status = details?.status;
    const repository = status?.state === 'clean' || status?.state === 'dirty';
    const keyword = query.trim().toLocaleLowerCase();
    const config = details?.config.filter(entry => `${entry.key}\n${entry.value}`.toLocaleLowerCase().includes(keyword)) ?? [];

    return <section className="git-pane" aria-label={`${service.name} Git 详情`}>
        <div className="git-heading">
            <div className="git-title"><GitBranch size={16}/><span>{service.name}</span><span className="git-kicker">Git</span></div>
            <div className="git-heading-actions">
                <button className="icon-button subtle" type="button" onClick={() => void refresh()} disabled={loading} aria-label="刷新 Git 状态" title="刷新 Git 状态">
                    {loading ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>}
                </button>
                <button className="text-button" type="button" onClick={onBack}><ArrowLeft size={13}/>日志</button>
            </div>
        </div>
        <div className="git-viewport">
            {error ? <div className="git-empty is-error" role="alert">{error}</div>
                : !details ? <div className="git-empty"><LoaderCircle className="spin" size={20}/>正在读取 Git 信息…</div>
                    : <>
                        <div className={`git-overview git-${status?.state}`}>
                            <div className="git-overview-title"><strong>{repository ? gitBranch(details.status) : 'Git 仓库'}</strong><span className="git-state-text">{gitStateLabel(status)}</span></div>
                            {repository && <p>{gitCounts(details.status) || '没有待提交的变更'}</p>}
                            {status?.error && <p className="git-error" role="alert">{status.error}</p>}
                            {status?.state === 'not_repository' && <p>项目目录及其父目录中未发现 Git 仓库。</p>}
                            {status?.upstream && <p className="git-upstream">跟踪 {status.upstream} · 领先 {status.ahead} / 落后 {status.behind}<small>基于本地记录</small></p>}
                            {status?.root && <dl className="git-locations"><dt>仓库</dt><dd>{status.root}</dd>{details.gitDir && <><dt>Git 目录</dt><dd>{details.gitDir}</dd></>}</dl>}
                            {status?.root && <span className="git-scope">状态覆盖整个 Git 仓库，包含未跟踪文件。</span>}
                        </div>
                        {status?.root && <>
                            <div className="git-tabs" role="tablist" aria-label="Git 信息" onKeyDown={event => {
                                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                                event.preventDefault();
                                const next = event.key === 'Home' ? 'files' : event.key === 'End' ? 'config' : tab === 'files' ? 'config' : 'files';
                                setTab(next);
                                event.currentTarget.querySelector<HTMLButtonElement>(`#git-${next}-tab`)?.focus();
                            }}>
                                <button id="git-files-tab" role="tab" type="button" tabIndex={tab === 'files' ? 0 : -1} aria-selected={tab === 'files'} aria-controls="git-files-panel" onClick={() => setTab('files')}>变更文件 <span>{status.changed}</span></button>
                                <button id="git-config-tab" role="tab" type="button" tabIndex={tab === 'config' ? 0 : -1} aria-selected={tab === 'config'} aria-controls="git-config-panel" onClick={() => setTab('config')}>本地配置 <span>{details.config.length}</span></button>
                            </div>
                            {tab === 'files' ? <div id="git-files-panel" role="tabpanel" aria-labelledby="git-files-tab">
                                {status.state === 'error' ? <div className="git-empty">无法读取变更，请刷新重试。</div>
                                    : details.files.length === 0 ? <div className="git-empty">工作区干净</div>
                                        : <ul className="git-file-list">{details.files.map((file, index) => <li key={`${file.path}-${index}`}>
                                            <code className={file.conflict ? 'git-file-code is-conflict' : 'git-file-code'} title="左列：暂存区；右列：工作区">{file.untracked ? '??' : `${file.indexStatus}${file.worktreeStatus}`}</code>
                                            <div><span>{file.path}</span>{file.previousPath && <small>原路径：{file.previousPath}</small>}</div>
                                            <span className="git-file-kind">{file.conflict ? '冲突' : file.untracked ? '未跟踪' : file.indexStatus !== '.' && file.worktreeStatus !== '.' ? '暂存 / 修改' : file.indexStatus !== '.' ? '已暂存' : '未暂存'}</span>
                                        </li>)}</ul>}
                                {details.truncated && <p className="git-scope">显示前 {details.files.length} 个文件，共 {status.changed} 个变更。</p>}
                            </div> : <div id="git-config-panel" role="tabpanel" aria-labelledby="git-config-tab">
                                <div className="git-config-toolbar"><code>git config --list --local</code><input type="search" aria-label="搜索 Git 配置" placeholder="搜索配置" value={query} onChange={event => setQuery(event.target.value)}/></div>
                                {details.configError ? <p className="git-error" role="alert">{details.configError}</p>
                                    : config.length === 0 ? <div className="git-empty">{query ? '没有匹配的配置' : '暂无本地配置'}</div>
                                        : <dl className="git-config-list">{config.map((entry, index) => <div key={`${entry.key}-${index}`}><dt>{entry.key}</dt><dd>{entry.value || <span className="git-empty-value">空值</span>}</dd></div>)}</dl>}
                            </div>}
                        </>}
                    </>}
        </div>
        <div className="git-footer"><span>{service.directory}</span><span>{loading ? '刷新中…' : status?.checkedAt ? `更新于 ${new Date(status.checkedAt).toLocaleTimeString('zh-CN')}` : '每 15 秒刷新'}</span></div>
    </section>;
}
