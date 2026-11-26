import {LoaderCircle, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {SetDefaultLaunchTargets} from '../../wailsjs/lal/app';
import type {ServiceView} from '../types';
import {errorMessage} from '../utils';
import '../styles/default-launch-targets.css';

export default function DefaultLaunchTargetsDialog({service, onClose, onSaved}: {
    service: ServiceView; onClose: () => void; onSaved: () => void;
}) {
    const targets = service.launchTargets ?? [];
    const [selected, setSelected] = useState(() => new Set(targets.filter(target => target.default).map(target => target.id)));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const formRef = useRef<HTMLFormElement>(null);
    useEffect(() => { formRef.current?.querySelector('input')?.focus(); }, []);
    useEffect(() => {
        const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopImmediatePropagation();
                if (!saving) onClose();
            }
            if (event.key !== 'Tab') return;
            const controls = formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
            if (!controls?.length) { event.preventDefault(); return; }
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        window.addEventListener('keydown', keyboard, true);
        return () => window.removeEventListener('keydown', keyboard, true);
    }, [onClose, saving]);
    const toggle = (id: string) => setSelected(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const save = async () => {
        if (saving) return;
        setSaving(true); setError('');
        try {
            await SetDefaultLaunchTargets(service.id, targets.filter(target => selected.has(target.id)).map(target => target.id));
            onSaved();
        } catch (failure) { setError(errorMessage(failure)); setSaving(false); }
    };
    return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
        <form ref={formRef} className="service-dialog default-launch-dialog" role="dialog" aria-modal="true" aria-labelledby="default-launch-title" aria-describedby="default-launch-hint"
            onSubmit={event => { event.preventDefault(); void save(); }}>
            <div className="dialog-heading"><h2 id="default-launch-title">默认启动</h2>
                <button className="icon-button subtle" type="button" onClick={onClose} disabled={saving} aria-label="关闭" title="关闭"><X size={17}/></button></div>
            <p id="default-launch-hint" className="default-launch-hint">可多选，点击「启动默认」时一同启动。</p>
            <fieldset className="default-launch-options" disabled={saving} aria-label={`${service.name} 的默认启动服务`}>
                {targets.map(target => <label key={target.id} title={target.command}>
                    <input className="selection-checkbox" type="checkbox" checked={selected.has(target.id)} onChange={() => toggle(target.id)}/>
                    <span>{target.name}</span>
                </label>)}
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions"><span className="default-launch-count">已选 {selected.size} 个</span>
                <button className="button secondary" type="button" disabled={saving} onClick={onClose}>取消</button>
                <button className="button primary" type="submit" disabled={saving}>{saving && <LoaderCircle className="spin" size={14}/>}保存</button>
            </div>
        </form>
    </div>;
}
