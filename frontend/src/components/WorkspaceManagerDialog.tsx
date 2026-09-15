import {Folder, LoaderCircle, X} from 'lucide-react';
import type {ServiceView} from '../types';

export default function WorkspaceManagerDialog({services, drafts, saving, onDraftChange, onClose, onSave}: {
    services: ServiceView[];
    drafts: Record<string, string>;
    saving: boolean;
    onDraftChange: (serviceId: string, value: string) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
        <div className="confirm-dialog workspace-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title">
            <div className="issue-heading"><span className="issue-icon"><Folder size={18}/></span><h2 id="workspace-manager-title">管理 Workspace</h2>
                <button className="icon-button subtle" type="button" onClick={onClose} disabled={saving} aria-label="关闭" title="关闭"><X size={18}/></button></div>
            <p className="workspace-manager-help">为每个服务设置固定 Workspace；留空时按目录层级自动分组。</p>
            <div className="workspace-manager-list">
                {services.map(service => (
                    <label key={service.id}>
                        <span title={service.name}>{service.name}</span>
                        <input value={drafts[service.id] ?? ''} onChange={event => onDraftChange(service.id, event.target.value)}
                            placeholder={service.workspace ? `自动：${service.workspace}` : '自动：未分组'} maxLength={80} spellCheck={false}/>
                    </label>
                ))}
            </div>
            <div className="dialog-actions">
                <button className="button secondary" type="button" onClick={onClose} disabled={saving}>取消</button>
                <button className="button primary" type="button" onClick={onSave} disabled={saving}>
                    {saving ? <LoaderCircle className="spin" size={16}/> : null}保存
                </button>
            </div>
        </div>
    </div>;
}
