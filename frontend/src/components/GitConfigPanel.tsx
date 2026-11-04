import {LoaderCircle, Pencil, Plus, Trash2, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {UpdateGitConfig} from '../../wailsjs/lal/app';
import type {GitDetails, ServiceView} from '../types';
import {errorMessage} from '../utils';
import {canonicalGitConfigKey} from '../gitUtils';
import '../styles/git-config.css';

type Editor = {key: string; values: string[]; expectedValues: string[]; creating: boolean};
const shortcuts = [{key: 'user.name', name: '用户名'}, {key: 'user.email', name: '邮箱'}, {key: 'remote.origin.url', name: 'Origin 地址'}];

export default function GitConfigPanel({service, details, onEditingChange, onSaved}: {
    service: ServiceView; details: GitDetails; onEditingChange: (editing: boolean) => void; onSaved: () => Promise<void>;
}) {
    const [query, setQuery] = useState('');
    const [editor, setEditor] = useState<Editor | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const keyword = query.trim().toLocaleLowerCase();
    const config = details.config.filter(entry => `${entry.key}\n${entry.value}`.toLocaleLowerCase().includes(keyword));

    useEffect(() => () => onEditingChange(false), [onEditingChange]);

    const open = (key: string, creating = false) => {
        const expectedValues = details.config.filter(entry => entry.key === key).map(entry => entry.value);
        setEditor({key, creating, expectedValues, values: expectedValues.length ? [...expectedValues] : ['']});
        setError(''); setMessage(''); setDeleting(false);
        onEditingChange(true);
    };
    const close = () => {
        setEditor(null); setError(''); setDeleting(false);
        onEditingChange(false);
    };
    const save = async (remove = false) => {
        if (!editor || saving) return;
        if (!editor.key.trim()) { setError('请填写配置键，例如 user.email'); return; }
        if (editor.creating && details.config.some(entry => entry.key === canonicalGitConfigKey(editor.key))) {
            setError('配置键已存在，请编辑现有条目'); return;
        }
        setSaving(true); setError('');
        try {
            await UpdateGitConfig(service.id, {
                directory: service.directory, root: details.status.root, key: editor.key,
                expectedValues: editor.expectedValues, values: remove ? [] : editor.values,
            });
            await onSaved();
            setMessage(`${editor.key} 已${remove ? '删除' : '保存'}`);
            close();
        } catch (error) { setError(errorMessage(error)); }
        finally { setSaving(false); }
    };

    return <>
        <div className="git-config-toolbar"><code>git config --list --local</code>
            <input type="search" aria-label="搜索 Git 配置" placeholder="搜索配置" value={query} onChange={event => setQuery(event.target.value)}/>
            <button className="text-button" type="button" onClick={() => open('', true)} disabled={editor !== null || !!details.configError}><Plus size={12}/>新增配置</button>
        </div>
        <div className="git-config-shortcuts"><span>快速编辑</span>{shortcuts.map(shortcut => <button className="text-button" type="button" key={shortcut.key}
            disabled={editor !== null || !!details.configError} onClick={() => open(shortcut.key)}>{shortcut.name}</button>)}</div>
        {message && <p className="git-config-success" role="status">{message}</p>}
        {editor && <form className="git-config-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
            <div className="git-config-editor-heading"><strong>{editor.creating ? '新增配置' : '编辑配置'}</strong><span>仅此仓库 · local</span>
                <button className="icon-button subtle" type="button" aria-label="取消编辑 Git 配置" onClick={close} disabled={saving}><X size={14}/></button></div>
            <label>配置键<input aria-label="Git 配置键" maxLength={512} autoFocus={editor.creating} value={editor.key} readOnly={!editor.creating} disabled={saving} placeholder="例如 user.email"
                onChange={event => setEditor({...editor, key: event.target.value})}/></label>
            <div className="git-config-values">{editor.values.map((value, index) => <div key={index}><label>{editor.values.length > 1 ? `值 ${index + 1}` : '配置值'}
                <textarea aria-label={editor.values.length > 1 ? `配置值 ${index + 1}` : '配置值'} maxLength={65536} autoFocus={!editor.creating && index === 0} rows={value.includes('\n') ? 3 : 2} value={value} disabled={saving}
                    onChange={event => setEditor({...editor, values: editor.values.map((current, position) => position === index ? event.target.value : current)})}/></label>
                {editor.values.length > 1 && <button className="icon-button subtle" type="button" disabled={saving} aria-label={`移除配置值 ${index + 1}`}
                    onClick={() => setEditor({...editor, values: editor.values.filter((_, position) => position !== index)})}><X size={13}/></button>}</div>)}</div>
            {error && <p className="git-error" role="alert">{error}</p>}
            {deleting ? <div className="git-config-delete"><span>删除 {editor.key} 的全部本地值？</span>
                <button className="text-button" type="button" disabled={saving} onClick={() => setDeleting(false)}>返回编辑</button>
                <button className="button danger" type="button" disabled={saving} onClick={() => void save(true)}>{saving ? '删除中…' : '确认删除'}</button>
            </div> : <div className="git-config-editor-actions">
                <button className="text-button" type="button" disabled={saving || editor.values.length >= 128} onClick={() => setEditor({...editor, values: [...editor.values, '']})}><Plus size={12}/>添加值</button>
                {editor.expectedValues.length > 0 && <button className="text-button git-config-remove" type="button" disabled={saving} onClick={() => setDeleting(true)}><Trash2 size={12}/>删除配置</button>}
                <span/><button className="text-button" type="button" disabled={saving} onClick={close}>取消</button>
                <button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={13}/>}保存配置</button>
            </div>}
        </form>}
        {details.configError ? <p className="git-error" role="alert">{details.configError}</p>
            : config.length === 0 ? <div className="git-empty">{query ? '没有匹配的配置' : '暂无本地配置'}</div>
                : <dl className="git-config-list">{config.map((entry, index) => <div key={`${entry.key}-${index}`}><dt>{entry.key}</dt><dd>{entry.value || <span className="git-empty-value">空值</span>}</dd>
                    <button className="git-config-edit-button" type="button" disabled={editor !== null} aria-label={`编辑 ${entry.key}`} title={`编辑 ${entry.key}`} onClick={() => open(entry.key)}><Pencil size={12}/></button>
                </div>)}</dl>}
    </>;
}
