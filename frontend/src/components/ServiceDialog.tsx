import {Check, CircleAlert, FolderOpen, LoaderCircle, X} from 'lucide-react';
import type {FormEvent} from 'react';
import {useEffect, useRef, useState} from 'react';
import {ChooseDirectory, CreateService, UpdateService} from '../../wailsjs/lal/app';
import {categoryOf, defaultCleanCommand, emptyForm, moduleOf} from '../types';
import type {DialogState, ServiceForm, ServiceView} from '../types';
import {errorMessage} from '../utils';
import {useProjectDetection} from '../hooks/useProjectDetection';
import '../styles/project-detection.css';
import LaunchTargetsEditor from './LaunchTargetsEditor';
import BuildProfilesEditor from './BuildProfilesEditor';

export default function ServiceDialog({state, services, workspaces: catalog = [], onClose, onSaved}: {state: DialogState; services: ServiceView[]; workspaces?: string[]; onClose: () => void; onSaved: (service: ServiceView) => Promise<void>}) {
    const module = state.mode === 'edit' ? moduleOf(state.service) : state.module;
    const isGame = module === 'game';
    const noun = isGame ? '游戏' : '服务';
    const [initial] = useState<ServiceForm>(() => state.mode === 'edit' ? {category: categoryOf(state.service), launchTargets: state.service.launchTargets ?? [], name: state.service.name, workspace: state.service.configuredWorkspace ?? '', directory: state.service.directory, command: state.service.command, releaseCommand: state.service.releaseCommand ?? '', buildCommand: state.service.buildCommand ?? '', buildProfiles: state.service.buildProfiles ?? [], buildBeforeLaunch: state.service.buildBeforeLaunch ?? false, launchMode: state.service.launchMode ?? 'debug', url: state.service.url ?? '', cleanCommand: state.service.cleanCommand ?? defaultCleanCommand} : {...emptyForm, category: 'standalone', command: ''});
    const {form, detection, analyzing, detectionError, change, chooseScript} = useProjectDetection(initial, state.mode === 'edit');
    const [saving, setSaving] = useState(false);
    const [readingProfiles, setReadingProfiles] = useState(false);
    const [browsing, setBrowsing] = useState(false);
    const [error, setError] = useState('');
    const firstInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => firstInputRef.current?.focus(), []);
    const workspaces = [...new Set(catalog.concat(services.flatMap(service => [service.workspace, service.configuredWorkspace])
        .concat(form.workspace).filter((name): name is string => Boolean(name))))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const selectedScript = detection?.scripts.find(script => script.command === form.command);

    const browse = async () => {
        setBrowsing(true); setError('');
        try {
            let directory: string;
            try { directory = await ChooseDirectory(form.directory); }
            catch { directory = await ChooseDirectory(''); }
            if (directory) change('directory', directory);
        } catch (browseError) { setError(errorMessage(browseError)); }
        finally { setBrowsing(false); }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (saving || browsing || analyzing || readingProfiles) return;
        const normalized = {...(!isGame ? {category: form.category ?? 'standalone'} : {}), ...(!isGame && (form.launchTargets?.length || initial.launchTargets?.length) ? {launchTargets: form.launchTargets ?? []} : {}), name: form.name.trim(), module, workspace: form.workspace.trim(), directory: detection?.directory ?? form.directory.trim(), command: form.command.trim(), ...(isGame ? {buildCommand: (form.buildCommand ?? '').trim(), buildProfiles: (form.buildProfiles ?? []).map(profile => ({...profile, name: profile.name.trim(), command: profile.command.trim()})), buildBeforeLaunch: Boolean(form.buildCommand?.trim() && form.buildBeforeLaunch), releaseCommand: (form.releaseCommand ?? '').trim(), launchMode: form.launchMode ?? 'debug'} : {}), url: form.url.trim(), cleanCommand: form.cleanCommand.trim()};
        if (state.mode === 'edit' && (isGame || normalized.category === initial.category) && JSON.stringify(normalized.launchTargets ?? []) === JSON.stringify(initial.launchTargets ?? []) && normalized.name === initial.name && normalized.workspace === initial.workspace && normalized.directory === initial.directory && JSON.stringify(normalized.buildProfiles ?? []) === JSON.stringify(initial.buildProfiles ?? []) && normalized.buildCommand === (isGame ? initial.buildCommand : undefined) && normalized.buildBeforeLaunch === (isGame ? initial.buildBeforeLaunch : undefined) && (normalized.releaseCommand ?? '') === (initial.releaseCommand ?? '') && (normalized.launchMode ?? '') === (isGame ? initial.launchMode ?? 'debug' : '') && normalized.command === initial.command && normalized.url === initial.url && normalized.cleanCommand === initial.cleanCommand) { onClose(); return; }
        setSaving(true); setError('');
        try {
            const service = state.mode === 'create' ? await CreateService(normalized) : await UpdateService(state.service.id, normalized);
            await onSaved(service);
        } catch (saveError) { setError(errorMessage(saveError)); setSaving(false); }
    };

    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
        <form className="service-dialog" onSubmit={event => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="service-dialog-title">
            <div className="dialog-heading"><h2 id="service-dialog-title">{state.mode === 'create' ? `添加本地${noun}` : `编辑${noun}`}</h2>
                <button className="icon-button subtle" type="button" onClick={onClose} disabled={saving} aria-label="关闭" title="关闭"><X size={18}/></button></div>
            <div className="form-fields">
                <label><span>项目目录</span><div className="input-with-action"><input ref={firstInputRef} value={form.directory} onChange={event => change('directory', event.target.value)} required placeholder="选择或粘贴项目目录" spellCheck={false} disabled={saving}/>
                    <button type="button" onClick={() => void browse()} aria-label="选择目录" title="选择目录" disabled={browsing || saving}>{browsing ? <LoaderCircle className="spin" size={17}/> : <FolderOpen size={17}/>}</button></div></label>
                <div className={`project-detection-status${detectionError ? ' has-warning' : ''}`} role="status" aria-live="polite">
                    {analyzing ? <><LoaderCircle className="spin" size={14}/><span>正在解析项目配置…</span></> : detectionError ? <><CircleAlert size={14}/><span>{detectionError}，仍可手动填写。</span></> : detection ? <><Check size={14}/><span>{detection.sources.length ? `已读取 ${detection.sources.join('、')}，请确认下方配置。` : `已选择目录，请补充${noun}配置。`}</span></> : <><FolderOpen size={14}/><span>选择项目后读取名称、启动脚本和端口。</span></>}
                </div>
                {!isGame && <label><span>项目分类</span><select aria-label="项目分类" value={form.launchTargets?.length ? 'monorepo' : form.category ?? 'standalone'} onChange={event => change('category', event.target.value as 'standalone' | 'monorepo')} disabled={saving}>
                    <option value="standalone" disabled={Boolean(form.launchTargets?.length)}>普通服务</option><option value="monorepo">Monorepo</option>
                </select></label>}
                {!isGame && detection?.monorepoEvidence?.length ? <p className="field-hint">识别依据：{detection.monorepoEvidence.join('；')}。{!form.launchTargets?.length && '可使用根启动命令，或添加项目进程。'}</p> : null}
                {detection?.warnings.filter(warning => warning.startsWith('package.json') || warning.startsWith('.lal.json')).map(warning => <p className="field-hint" key={warning}>{warning}</p>)}
                <div className="service-identity-fields">
                    <label><span>{noun}名称</span><input value={form.name} onChange={event => change('name', event.target.value)} maxLength={80} required placeholder={isGame ? '例如 Tiny Quest' : '例如 Web Demo'} disabled={saving}/></label>
                    <label><span>Workspace <small>可选</small></span><select value={form.workspace} onChange={event => change('workspace', event.target.value)} aria-label="Workspace" disabled={saving}>
                        <option value="">未分组</option>
                        {workspaces.map(workspace => <option key={workspace} value={workspace}>{workspace}</option>)}
                    </select></label>
                </div>
                {(isGame || !form.launchTargets?.length) && <label><span>{isGame ? 'Debug 启动命令' : '启动命令'}</span>{Boolean(detection?.scripts.length) && <select aria-label="项目启动脚本" value={selectedScript?.command ?? ''} onChange={event => chooseScript(event.target.value)} disabled={saving}>
                    <option value="">自定义命令</option>{detection?.scripts.map(script => <option key={script.name} value={script.command}>{script.name} · {script.preview}</option>)}
                </select>}<input aria-label="启动命令" className="command-input" value={form.command} onChange={event => change('command', event.target.value)} required={!form.launchTargets?.length} maxLength={1000} placeholder="npm run dev" spellCheck={false} disabled={saving}/></label>}
                {!isGame && <LaunchTargetsEditor targets={form.launchTargets ?? []} directory={form.directory} disabled={saving} onChange={targets => change('launchTargets', targets)} onReadingChange={setReadingProfiles}/>}
                {isGame && <label><span>正式版启动命令 <small>可选</small></span><input aria-label="正式版启动命令" className="command-input" value={form.releaseCommand ?? ''} onChange={event => change('releaseCommand', event.target.value)} maxLength={1000} placeholder="'dist/macos/Game.app/Contents/MacOS/Game'" spellCheck={false} disabled={saving}/><span className="field-hint">构建成功后运行此正式产物；未配置构建时直接启动已有版本。</span></label>}
                {isGame && <label><span>构建并导出命令 <small>可选 · 在项目目录执行</small></span><textarea aria-label="构建并导出命令" className="command-input cache-command-input" value={form.buildCommand ?? ''} onChange={event => change('buildCommand', event.target.value)} maxLength={2000} rows={2} placeholder="例如 python3 tools/godot/build_macos.py" spellCheck={false} disabled={saving}/><span className="field-hint">默认构建命令，也用于正式启动前构建；其他产物在下方添加打包方案。</span></label>}
                {isGame && <label className="game-build-option"><input type="checkbox" checked={Boolean(form.buildBeforeLaunch)} onChange={event => change('buildBeforeLaunch', event.target.checked)} disabled={saving || !form.buildCommand?.trim()}/><span>正式启动前构建并导出</span></label>}
                {isGame && <BuildProfilesEditor profiles={form.buildProfiles ?? []} directory={form.directory} disabled={saving} onChange={profiles => change('buildProfiles', profiles)} onReadingChange={setReadingProfiles}/>}
                {isGame && <label><span>默认启动模式</span><select aria-label="默认启动模式" value={form.launchMode ?? 'debug'} onChange={event => change('launchMode', event.target.value)} disabled={saving}><option value="release" disabled={!form.releaseCommand?.trim()}>正式版</option><option value="debug">Debug</option></select></label>}
                <label><span>{isGame ? '游戏预览地址' : '访问地址'} <small>可选</small></span><input className="command-input" value={form.url} onChange={event => change('url', event.target.value)} maxLength={500} inputMode="url" placeholder={isGame ? 'http://localhost:18040/index.html' : 'http://localhost:3900'} spellCheck={false} disabled={saving}/>
                    {detection && !form.url && <span className="field-hint">未解析到地址；可用项目根目录 .lal.json 的 url 字段声明，或手动填写。</span>}</label>
                {detection && !form.command && <p className="field-hint">未识别到常用启动脚本，请选择脚本或填写命令。</p>}
                <label><span>{isGame ? '资源缓存清理' : '缓存清理脚本'} <small>在项目目录执行</small></span><textarea className="command-input cache-command-input" value={form.cleanCommand} onChange={event => change('cleanCommand', event.target.value)} required maxLength={2000} rows={2} placeholder={isGame ? 'rm -rf .godot' : 'rm -rf .next'} spellCheck={false} disabled={saving}/></label>
            </div>
            {error && <div className="form-error"><CircleAlert size={15}/><span>{error}</span></div>}
            <div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose} disabled={saving}>取消</button><button className="button primary" type="submit" disabled={saving || browsing || analyzing || readingProfiles}>{saving && <LoaderCircle className="spin" size={16}/>} {state.mode === 'create' ? `添加${noun}` : '保存'}</button></div>
        </form>
    </div>;
}
