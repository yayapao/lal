import {ChevronDown, Hammer} from 'lucide-react';
import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {ServiceView} from '../types';
import '../styles/build-profiles.css';

export default function GameBuildButton({service, disabled, onBuild}: {
    service: ServiceView; disabled: boolean; onBuild: (profileID?: string) => void;
}) {
    const [position, setPosition] = useState<{left: number; top: number} | null>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const id = useId();
    const profiles = service.buildProfiles ?? [];
    const choices = [...(service.buildCommand ? [{id: '', name: '默认构建', command: service.buildCommand}] : []), ...profiles];
    const close = () => { setPosition(null); trigger.current?.focus(); };
    useEffect(() => {
        if (!position) return;
        menu.current?.querySelector('button')?.focus();
        const dismiss = (event: Event) => {
            if (event.type !== 'scroll' || !menu.current?.contains(event.target as Node)) setPosition(null);
        };
        window.addEventListener('resize', dismiss);
        window.addEventListener('scroll', dismiss, true);
        return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); };
    }, [position]);
    useEffect(() => { if (disabled) setPosition(null); }, [disabled]);
    const toggle = () => {
        if (!profiles.length) { onBuild(); return; }
        if (position) { close(); return; }
        const rect = trigger.current!.getBoundingClientRect();
        const height = Math.min(choices.length * 38 + 12, 320, window.innerHeight - 16);
        setPosition({left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)),
            top: Math.max(8, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 6 : rect.bottom + 6)});
    };
    return <>
        <button ref={trigger} type="button" className="game-action build" disabled={disabled}
            aria-label={`构建 ${service.name}`} aria-haspopup={profiles.length ? 'menu' : undefined} aria-expanded={profiles.length ? Boolean(position) : undefined}
            aria-controls={position ? id : undefined} title={profiles.length ? '选择打包方案' : service.buildCommand || '配置构建并导出命令'}
            onClick={event => { event.stopPropagation(); toggle(); }}><Hammer size={14}/><span>构建</span>{profiles.length > 0 && <ChevronDown size={12}/>}</button>
        {position && createPortal(<div onClick={event => event.stopPropagation()}>
            <button className="menu-scrim" type="button" onClick={close} aria-label="关闭打包方案"/>
            <div ref={menu} id={id} className="context-menu game-build-menu" role="menu" aria-label={`${service.name} 打包方案`} style={position}
                onKeyDown={event => {
                    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const items = Array.from(menu.current!.querySelectorAll('button'));
                    const current = items.indexOf(document.activeElement as HTMLButtonElement);
                    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
                        (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                    items[index]?.focus();
                }}>
                {choices.map(choice => <button type="button" role="menuitem" key={choice.id} title={choice.command}
                    onClick={() => { close(); onBuild(choice.id || undefined); }}><Hammer size={14}/><span>{choice.name}</span></button>)}
            </div>
        </div>, document.body)}
    </>;
}
