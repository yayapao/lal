import {CircleAlert, FolderOpen, LoaderCircle, X} from 'lucide-react';
import type {FormEvent} from 'react';
import {useEffect, useRef, useState} from 'react';
import {ChooseDirectory, CreateService, UpdateService} from '../../wailsjs/go/main/App';
import {defaultCleanCommand, emptyForm} from '../types';
import type {DialogState, ServiceForm, ServiceView} from '../types';
import {errorMessage} from '../utils';

export default function ServiceDialog({state, onClose, onSaved}: {state: DialogState; onClose: () => void; onSaved: (service: ServiceView) => Promise<void>}) {
    const initial = state.mode === 'edit' ? {name: state.service.name, workspace: state.service.workspace ?? '', directory: state.service.directory, command: state.service.command, url: state.service.url ?? '', cleanCommand: state.service.cleanCommand ?? defaultCleanCommand} : emptyForm;
    const [form, setForm] = useState<ServiceForm>(initial);
    const [saving, setSaving] = useState(false);
    const [browsing, setBrowsing] = useState(false);
    const [error, setError] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => nameInputRef.current?.focus(), []);

    const browse = async () => {
        setBrowsing(true); setError('');
        try {
            let directory: string;
            try { directory = await ChooseDirectory(form.directory); }
            catch { directory = await ChooseDirectory(''); }
            if (directory) setForm(current => ({...current, directory}));
        } catch (browseError) { setError(errorMessage(browseError)); }
        finally { setBrowsing(false); }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const normalized = {name: form.name.trim(), workspace: form.workspace.trim(), directory: form.directory.trim(), command: form.command.trim(), url: form.url.trim(), cleanCommand: form.cleanCommand.trim()};
        if (state.mode === 'edit' && normalized.name === initial.name && normalized.workspace === initial.workspace && normalized.directory === initial.directory && normalized.command === initial.command && normalized.url === initial.url && normalized.cleanCommand === initial.cleanCommand) { onClose(); return; }
        setSaving(true); setError('');
        try {
            const service = state.mode === 'create' ? await CreateService(normalized) : await UpdateService(state.service.id, normalized);
            await onSaved(service);
        } catch (saveError) { setError(errorMessage(saveError)); setSaving(false); }
    };

    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <form className="service-dialog" onSubmit={event => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="service-dialog-title">
            <div className="dialog-heading"><h2 id="service-dialog-title">{state.mode === 'create' ? '添加本地服务' : '编辑服务'}</h2>
                <button className="icon-button subtle" type="button" onClick={onClose} aria-label="关闭" title="关闭"><X size={18}/></button></div>
            <div className="form-fields">
                <label><span>服务名称</span><input ref={nameInputRef} value={form.name} onChange={event => setForm({...form, name: event.target.value})} maxLength={80} required placeholder="例如 myStock"/></label>
                <label><span>Workspace <small>可选</small></span><input value={form.workspace} onChange={event => setForm({...form, workspace: event.target.value})} maxLength={80} placeholder="例如 ViewAI" spellCheck={false}/></label>
                <label><span>项目目录</span><div className="input-with-action"><input value={form.directory} onChange={event => setForm({...form, directory: event.target.value})} required placeholder="/Users/name/path/to/project" spellCheck={false}/>
                    <button type="button" onClick={() => void browse()} aria-label="选择目录" title="选择目录" disabled={browsing}>{browsing ? <LoaderCircle className="spin" size={17}/> : <FolderOpen size={17}/>} </button></div></label>
                <label><span>启动命令</span><input className="command-input" value={form.command} onChange={event => setForm({...form, command: event.target.value})} required maxLength={1000} placeholder="npm run dev" spellCheck={false}/></label>
                <label><span>访问地址 <small>可选</small></span><input className="command-input" value={form.url} onChange={event => setForm({...form, url: event.target.value})} maxLength={500} inputMode="url" placeholder="http://localhost:3900" spellCheck={false}/></label>
                <label><span>缓存清理脚本 <small>在项目目录执行</small></span><textarea className="command-input cache-command-input" value={form.cleanCommand} onChange={event => setForm({...form, cleanCommand: event.target.value})} required maxLength={2000} rows={2} placeholder="rm -rf .next" spellCheck={false}/></label>
            </div>
            {error && <div className="form-error"><CircleAlert size={15}/><span>{error}</span></div>}
            <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={16}/>} {state.mode === 'create' ? '添加服务' : '保存'}</button></div>
        </form>
    </div>;
}
