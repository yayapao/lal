import {CircleAlert, LoaderCircle, Trash2, X} from 'lucide-react';
import {defaultCleanCommand} from '../types';
import type {OperationIssue, ServiceView} from '../types';
import {isActive} from '../utils';

export function DeleteDialog({target, onClose, onConfirm}: {target: ServiceView; onClose: () => void; onConfirm: () => void}) {
    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="confirm-icon"><Trash2 size={18}/></div><h2 id="delete-title">移除 {target.name}？</h2>
            <p>该操作只删除 LAL 中的配置，不会删除项目文件。</p>
            <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button danger" type="button" onClick={onConfirm}>移除</button></div>
        </div>
    </div>;
}

export function CacheDialog({target, busy, onClose, onConfirm}: {target: ServiceView; busy: boolean; onClose: () => void; onConfirm: () => void}) {
    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cache-title">
            <div className="confirm-icon"><Trash2 size={18}/></div><h2 id="cache-title">执行 {target.name} 的缓存清理？</h2>
            <p>将在项目目录执行以下脚本：</p><pre className="cache-command-preview">{target.cleanCommand || defaultCleanCommand}</pre><p>{isActive(target) ? '当前服务会先停止，清理后自动重启。' : '当前服务未运行，清理后保持停止。'}</p>
            <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>取消</button><button className="button danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Trash2 size={15}/>}清除缓存</button></div>
        </div>
    </div>;
}

export function IssueDialog({issue, onClose}: {issue: OperationIssue; onClose: () => void}) {
    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="issue-dialog" role="alertdialog" aria-modal="true" aria-labelledby="issue-title">
            <div className="issue-heading"><span className="issue-icon"><CircleAlert size={18}/></span><h2 id="issue-title">{issue.title}</h2>
                <button className="icon-button subtle" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={18}/></button></div>
            <pre>{issue.message}</pre>
            <div className="dialog-actions"><button className="button primary" type="button" onClick={onClose}>知道了</button></div>
        </div>
    </div>;
}
