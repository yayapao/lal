import {Download, LoaderCircle, Plus, Trash2} from 'lucide-react';
import {useState} from 'react';
import {DetectProject} from '../../wailsjs/lal/app';
import type {BuildProfile} from '../types';
import {errorMessage} from '../utils';
import '../styles/build-profiles.css';

export default function BuildProfilesEditor({profiles, directory, disabled, onChange, onReadingChange}: {
    profiles: BuildProfile[]; directory: string; disabled: boolean; onChange: (profiles: BuildProfile[]) => void;
    onReadingChange: (reading: boolean) => void;
}) {
    const [reading, setReading] = useState(false);
    const [error, setError] = useState('');
    const update = (index: number, field: 'name' | 'command', value: string) => {
        onChange(profiles.map((profile, i) => i === index ? {...profile, [field]: value} : profile));
    };
    const importProfiles = async () => {
        setReading(true); onReadingChange(true); setError('');
        try {
            const result = await DetectProject(directory);
            const warning = result.warnings.find(value => value.startsWith('.lal.json 打包方案无效'));
            if (warning) throw new Error(warning);
            if (!result.buildProfiles?.length) throw new Error('项目 .lal.json 中没有打包方案');
            onChange(result.buildProfiles);
        } catch (failure) { setError(errorMessage(failure)); }
        finally { setReading(false); onReadingChange(false); }
    };
    return <section className="build-profiles-editor" aria-label="打包方案配置">
        <div className="build-profiles-heading"><span>打包方案 <small>可选</small></span>
            <button type="button" className="button ghost" disabled={disabled || reading || !directory.trim()} onClick={() => void importProfiles()}>
                {reading ? <LoaderCircle size={13} className="spin"/> : <Download size={13}/>}从项目读取</button>
        </div>
        {profiles.map((profile, index) => <div className="build-profile-fields" key={profile.id}>
            <div className="build-profile-name"><label><span>方案名称</span><input aria-label={`打包方案 ${index + 1} 名称`} value={profile.name} required maxLength={80}
                placeholder="例如 Mac · 中文" disabled={disabled || reading} onChange={event => update(index, 'name', event.target.value)}/></label>
                <button type="button" className="icon-button subtle" aria-label={`删除打包方案 ${index + 1}`} disabled={disabled || reading}
                    onClick={() => onChange(profiles.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>
            <label><span>打包命令</span><textarea className="command-input" aria-label={`打包方案 ${index + 1} 命令`} value={profile.command} required maxLength={2000} rows={2}
                spellCheck={false} placeholder="在项目目录执行的完整命令" disabled={disabled || reading} onChange={event => update(index, 'command', event.target.value)}/></label>
        </div>)}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="button ghost" disabled={disabled || reading || profiles.length >= 16}
            onClick={() => onChange([...profiles, {id: crypto.randomUUID(), name: '', command: ''}])}><Plus size={14}/>添加打包方案</button>
        <span className="field-hint">在游戏卡片中选择方案后直接打包；正式启动前仍使用上方的默认构建命令。</span>
    </section>;
}
