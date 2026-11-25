import {Download, Plus, Trash2} from 'lucide-react';
import {useRef, useState} from 'react';
import {DetectProject} from '../../wailsjs/lal/app';
import type {LaunchTarget} from '../types';
import {errorMessage} from '../utils';
import '../styles/launch-targets.css';

export default function LaunchTargetsEditor({targets, directory, disabled, onChange, onReadingChange}: {
    targets: LaunchTarget[]; directory: string; disabled: boolean;
    onChange: (targets: LaunchTarget[]) => void; onReadingChange: (reading: boolean) => void;
}) {
    const [reading, setReading] = useState(false);
    const [error, setError] = useState('');
    const latestDirectory = useRef(directory);
    latestDirectory.current = directory;
    const update = (index: number, patch: Partial<LaunchTarget>) => onChange(targets.map((target, i) => i === index ? {...target, ...patch} : target));
    const read = async () => {
        const requested = directory;
        setReading(true); onReadingChange(true); setError('');
        try {
            const result = await DetectProject(requested);
            if (latestDirectory.current !== requested) return;
            const warning = result.warnings.find(value => value.startsWith('.lal.json 进程配置无效'));
            if (warning) throw new Error(warning);
            if (!result.launchTargets?.length) throw new Error('项目 .lal.json 中没有进程配置');
            onChange(result.launchTargets);
        } catch (failure) { if (latestDirectory.current === requested) setError(errorMessage(failure)); }
        finally { setReading(false); onReadingChange(false); }
    };
    return <section className="launch-targets-editor" aria-label="项目进程配置">
        <div className="target-heading"><span>项目进程</span><button className="button ghost" type="button" disabled={disabled || reading || !directory.trim()} onClick={() => void read()}><Download size={13}/>从项目读取</button></div>
        {targets.map((target, index) => <div className="target-fields" key={target.id}>
            <div className="target-heading"><label><span>进程名称</span><input aria-label={`进程 ${index + 1} 名称`} required maxLength={80} value={target.name} disabled={disabled || reading} onChange={event => update(index, {name: event.target.value})}/></label>
                <button type="button" className="icon-button subtle" aria-label={`删除进程 ${index + 1}`} disabled={disabled || reading} onClick={() => onChange(targets.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>
            <label><span>启动命令</span><input aria-label={`进程 ${index + 1} 启动命令`} className="command-input" required maxLength={1000} value={target.command} spellCheck={false} disabled={disabled || reading} onChange={event => update(index, {command: event.target.value})}/></label>
            <label><span>访问地址 <small>可选</small></span><input aria-label={`进程 ${index + 1} 访问地址`} className="command-input" value={target.url ?? ''} maxLength={500} disabled={disabled || reading} onChange={event => update(index, {url: event.target.value})}/></label>
            <label className="target-checkbox"><input type="checkbox" checked={target.default} disabled={disabled || reading} onChange={event => update(index, {default: event.target.checked})}/><span>默认启动</span></label>
        </div>)}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button ghost" type="button" disabled={disabled || reading || targets.length >= 16} onClick={() => onChange([...targets, {id: crypto.randomUUID(), name: '', command: '', url: '', default: targets.length === 0}])}><Plus size={14}/>添加进程</button>
    </section>;
}
