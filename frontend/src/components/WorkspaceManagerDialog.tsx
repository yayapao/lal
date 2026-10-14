import {useEffect, useState} from 'react';
import type {ServiceView, WorkspaceDraft} from '../types';
import '../styles/workspace-manager.css';

export default function WorkspaceManagerDialog({services, draft, saving, error, onChange, onClose, onSave}: {
    services: ServiceView[];
    draft: WorkspaceDraft;
    saving: boolean;
    error: string;
    onChange: (draft: WorkspaceDraft) => void;
    onClose: () => void;
    onSave: () => void;
}) {
    const [active, setActive] = useState(draft.workspaces[0] ?? '');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [destination, setDestination] = useState('');
    const [adding, setAdding] = useState(false);
    const [naming, setNaming] = useState<'create' | 'rename' | null>(null);
    const [name, setName] = useState('');
    const [nameError, setNameError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const membership = (service: ServiceView) => draft.assignments[service.id] ?? '';
    const members = services.filter(service => membership(service) === active);
    const candidates = services.filter(service => adding ? membership(service) !== active : membership(service) === active);
    const keyword = query.trim().toLocaleLowerCase();
    const visible = candidates.filter(service => !keyword || `${service.name} ${service.directory}`.toLocaleLowerCase().includes(keyword));
    const allSelected = visible.length > 0 && visible.every(service => selected.has(service.id));

    useEffect(() => {
        const dismiss = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.stopImmediatePropagation(); if (!saving) onClose(); }
        };
        window.addEventListener('keydown', dismiss, true);
        return () => window.removeEventListener('keydown', dismiss, true);
    }, [onClose, saving]);

    const selectWorkspace = (workspace: string) => {
        setActive(workspace); setSelected(new Set()); setQuery(''); setDestination('');
        setAdding(false); setNaming(null); setNameError(''); setDeleting(false);
    };
    const assign = (ids: Iterable<string>, workspace: string) => {
        const assignments = {...draft.assignments};
        for (const id of ids) assignments[id] = workspace;
        onChange({...draft, assignments}); setSelected(new Set()); setDestination('');
    };
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
    const beginNaming = (mode: 'create' | 'rename') => {
        let number = 1;
        while (draft.workspaces.includes(`Workspace ${number}`)) number++;
        setName(mode === 'rename' ? active : `Workspace ${number}`);
        setNameError(''); setNaming(mode); setDeleting(false);
    };
    const saveName = () => {
        const value = name.trim();
        if (!value || value === '未分组' || value.length > 80) { setNameError('请输入 1–80 个字符，不能使用“未分组”。'); return; }
        if (draft.workspaces.some(workspace => workspace !== (naming === 'rename' ? active : null) && workspace.toLocaleLowerCase() === value.toLocaleLowerCase())) {
            setNameError('这个 Workspace 已存在。'); return;
        }
        if (naming === 'rename') {
            const assignments = Object.fromEntries(Object.entries(draft.assignments).map(([id, workspace]) => [id, workspace === active ? value : workspace]));
            onChange({workspaces: draft.workspaces.map(workspace => workspace === active ? value : workspace), assignments});
        } else onChange({...draft, workspaces: [...draft.workspaces, value]});
        selectWorkspace(value);
    };
    const deleteWorkspace = () => {
        onChange({workspaces: draft.workspaces.filter(workspace => workspace !== active),
            assignments: Object.fromEntries(Object.entries(draft.assignments).map(([id, workspace]) => [id, workspace === active ? '' : workspace]))});
        selectWorkspace('');
    };

    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
        <section className="workspace-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-manager-title">
            <header className="workspace-manager-heading"><h2 id="workspace-manager-title">Workspace</h2>
                <button type="button" onClick={onClose} disabled={saving}>关闭</button></header>
            <fieldset className="workspace-manager-body" disabled={saving}>
                <nav className="workspace-catalog" aria-label="Workspace 列表">
                    <button type="button" className={`workspace-catalog-item${active === '' ? ' is-active' : ''}`} onClick={() => selectWorkspace('')} aria-current={active === '' ? 'true' : undefined}>
                        <span>未分组</span><small>{services.filter(service => membership(service) === '').length}</small></button>
                    <div className="workspace-catalog-list">
                        {draft.workspaces.map(workspace => <button className={`workspace-catalog-item${active === workspace ? ' is-active' : ''}`} key={workspace}
                            type="button" onClick={() => selectWorkspace(workspace)} aria-label={`查看 ${workspace}`} aria-current={active === workspace ? 'true' : undefined}>
                            <span>{workspace}</span><small>{services.filter(service => membership(service) === workspace).length}</small></button>)}
                    </div>
                    <button className="workspace-create-button" type="button" onClick={() => beginNaming('create')}>新增 Workspace</button>
                    {naming === 'create' && <div className="workspace-name-editor">
                        <input autoFocus aria-label="新 Workspace 名称" value={name} onChange={event => setName(event.target.value)} maxLength={80}
                            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveName(); } }}/>
                        <div><button type="button" onClick={saveName}>创建</button><button type="button" onClick={() => setNaming(null)}>取消</button></div>
                        {nameError && <p role="alert">{nameError}</p>}
                    </div>}
                </nav>
                <section className="workspace-members" aria-label="项目归属">
                    <header className="workspace-members-heading">
                        {naming === 'rename' ? <div className="workspace-name-editor workspace-rename-editor">
                            <input autoFocus aria-label="Workspace 名称" value={name} onChange={event => setName(event.target.value)} maxLength={80}
                                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveName(); } }}/>
                            <div><button type="button" onClick={saveName}>确定</button><button type="button" onClick={() => setNaming(null)}>取消</button></div>
                            {nameError && <p role="alert">{nameError}</p>}
                        </div> : <div><h3>{adding ? `添加到 ${active}` : active || '未分组'}</h3><span>{adding ? `${candidates.length} 个可选项目` : `${members.length} 个项目`}</span></div>}
                        <div className="workspace-member-actions">
                            {adding ? <button type="button" onClick={() => { setAdding(false); setSelected(new Set()); setQuery(''); }}>返回</button> : active && <>
                                {members.length > 0 && <button className="workspace-add-projects-button" type="button" onClick={() => { setAdding(true); setSelected(new Set()); setQuery(''); }}>添加项目</button>}
                                <button type="button" onClick={() => beginNaming('rename')}>重命名</button>
                                <button className="workspace-delete-button" type="button" onClick={() => { setDeleting(true); setNaming(null); }}>删除</button>
                            </>}
                        </div>
                    </header>
                    {deleting && <div className="workspace-delete-confirm" role="alert">
                        <p>删除 {active}？{members.length > 0 ? `${members.length} 个项目将移到未分组。` : '此分组没有项目。'}</p>
                        <button type="button" onClick={deleteWorkspace}>确认删除</button><button type="button" onClick={() => setDeleting(false)}>取消</button>
                    </div>}
                    <div className="workspace-member-toolbar">
                        <input className="workspace-project-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索项目" aria-label="搜索项目"/>
                        <button type="button" onClick={() => setSelected(current => {
                            const next = new Set(current); for (const service of visible) { if (allSelected) next.delete(service.id); else next.add(service.id); } return next;
                        })} disabled={visible.length === 0}>{allSelected ? '取消全选' : '全选'}</button>
                    </div>
                    <div className="workspace-project-list">
                        {visible.map(service => <div className={`workspace-project-row${selected.has(service.id) ? ' is-selected' : ''}`} key={service.id}>
                            <input type="checkbox" checked={selected.has(service.id)} onChange={() => toggle(service.id)} aria-label={`选择项目 ${service.name}`}/>
                            <div className="workspace-project-info"><strong>{service.name}</strong><span title={service.directory}>{service.directory}</span></div>
                            {adding ? <span className="workspace-project-owner">{membership(service) || '未分组'}</span> : active && <button type="button" onClick={() => assign([service.id], '')} aria-label={`移出 ${service.name}`}>移出</button>}
                        </div>)}
                        {visible.length === 0 && <div className="workspace-members-empty">{keyword ? '没有匹配的项目' : adding ? '没有可添加的项目' : active ? '此 Workspace 还没有项目' : '所有项目都已分组'}
                            {!keyword && active && !adding && <button type="button" onClick={() => { setAdding(true); setSelected(new Set()); }}>添加项目</button>}
                        </div>}
                    </div>
                    <div className="workspace-members-footer"><span>已选 {selected.size}</span>
                        {adding ? <button className="button secondary" type="button" disabled={selected.size === 0} onClick={() => { assign(selected, active); setAdding(false); setQuery(''); }}>添加选中项目</button> : <>
                            <select aria-label="移动到 Workspace" value={destination} onChange={event => setDestination(event.target.value)} disabled={selected.size === 0}>
                                <option value="">移动到…</option>{['', ...draft.workspaces].filter(workspace => workspace !== active).map(workspace => <option key={workspace} value={JSON.stringify(workspace)}>{workspace || '未分组'}</option>)}
                            </select><button type="button" disabled={selected.size === 0 || !destination} onClick={() => assign(selected, JSON.parse(destination))}>移动</button>
                        </>}
                    </div>
                </section>
            </fieldset>
            {error && <p className="workspace-save-error" role="alert">{error}</p>}
            <footer className="workspace-manager-footer"><span>修改将在保存后生效</span><button className="button secondary" type="button" onClick={onClose} disabled={saving}>取消</button>
                <button className="button primary" type="button" onClick={onSave} disabled={saving || naming !== null}>{saving ? '保存中…' : '保存'}</button></footer>
        </section>
    </div>;
}
