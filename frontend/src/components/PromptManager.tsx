import {ArrowLeft, CircleAlert, Copy, FileText, LoaderCircle, MessageSquarePlus, Plus, RefreshCw, Unlink} from 'lucide-react';
import type {PromptFileView, ServiceView} from '../types';

export default function PromptManager({service, prompts, loading, error, adding, syncing, busy, onAdd, onRetry, onSync, onCopy, onOpen, onRemove, onBack}: {
    service: ServiceView;
    prompts: PromptFileView[];
    loading: boolean;
    error: string;
    adding: boolean;
    syncing: boolean;
    busy: {path: string; action: 'copy' | 'open' | 'remove'} | null;
    onAdd: () => void;
    onRetry: () => void;
    onSync: () => void;
    onCopy: (prompt: PromptFileView) => void;
    onOpen: (prompt: PromptFileView) => void;
    onRemove: (prompt: PromptFileView) => void;
    onBack: () => void;
}) {
    return <section className="prompt-pane" aria-label={`${service.name} Prompt 管理`}>
        <div className="prompt-heading">
            <div className="prompt-title"><MessageSquarePlus size={17}/><span>{service.name}</span><span className="prompt-count">{prompts.length} PROMPTS</span></div>
            <div className="prompt-heading-actions">
                <button className="icon-button subtle" type="button" onClick={onSync} disabled={loading || syncing || adding || busy !== null}
                    aria-label="同步 Prompt" title="同步 Prompt">{syncing ? <RefreshCw className="spin" size={16}/> : <RefreshCw size={16}/>}</button>
                <button className="button secondary prompt-add-button" type="button" onClick={onAdd} disabled={adding}>
                    {adding ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>}添加 Prompt
                </button>
                <button className="icon-button subtle" type="button" onClick={onBack} aria-label="返回日志" title="返回日志"><ArrowLeft size={17}/></button>
            </div>
        </div>
        <div className="prompt-viewport">
            {loading ? <div className="prompt-skeleton" aria-label="正在载入 Prompt">
                {[0, 1].map(item => <div className="prompt-skeleton-card" key={item}><span/><span/><span/></div>)}
            </div> : error ? <div className="prompt-state is-error">
                <CircleAlert size={24}/><span>{error}</span>
                <button className="text-button" type="button" onClick={onRetry}>重新载入</button>
            </div> : prompts.length === 0 ? <div className="prompt-state">
                <FileText size={25}/><span>prompts/ 中暂无 Prompt</span>
                <button className="text-button" type="button" onClick={onAdd} disabled={adding}>添加 Prompt</button>
            </div> : <div className="prompt-grid">{prompts.map(prompt => {
                const currentAction = busy?.path === prompt.path ? busy.action : null;
                return <article className={`prompt-card${prompt.error ? ' has-error' : ''}`} key={prompt.path}>
                    <header className="prompt-card-header">
                        <span className="prompt-file-icon"><FileText size={16}/></span>
                        <div className="prompt-card-name"><h3>{prompt.name}</h3><span title={prompt.path}>{prompt.displayPath}</span></div>
                        <span className="prompt-source">{prompt.source === 'project' ? '项目目录' : '外部关联'}</span>
                    </header>
                    {prompt.error ? <div className="prompt-card-error"><CircleAlert size={14}/><span>{prompt.error}</span></div>
                        : <pre className="prompt-preview">{prompt.content}</pre>}
                    <footer className="prompt-card-actions">
                        {prompt.source === 'added' && <button className="icon-button subtle" type="button" onClick={() => onRemove(prompt)}
                            disabled={busy !== null} aria-label={`移除 ${prompt.name} 关联`} title="移除关联">
                            {currentAction === 'remove' ? <LoaderCircle className="spin" size={15}/> : <Unlink size={15}/>}
                        </button>}
                        <span/>
                        <button className="icon-button subtle" type="button" onClick={() => onCopy(prompt)} disabled={busy !== null || Boolean(prompt.error)}
                            aria-label={`复制 ${prompt.name} 内容`} title="复制内容">
                            {currentAction === 'copy' ? <LoaderCircle className="spin" size={15}/> : <Copy size={15}/>}
                        </button>
                        <button className="button primary prompt-launch-button" type="button" onClick={() => onOpen(prompt)} disabled={busy !== null || Boolean(prompt.error)}
                            aria-label={`使用 ${prompt.name} 一键启动`}>
                            {currentAction === 'open' ? <LoaderCircle className="spin" size={15}/> : <MessageSquarePlus size={15}/>}一键启动
                        </button>
                    </footer>
                </article>;
            })}</div>}
        </div>
        <div className="prompt-footer"><span>{service.directory}/prompts</span><span>{prompts.length} 项</span></div>
    </section>;
}
