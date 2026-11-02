import {Gamepad2, Plus, Search, ServerCog, X} from 'lucide-react';
import {useEffect, useRef} from 'react';
import type {AppModule} from '../types';

export default function Toolbar({query, module, onModuleChange, onQueryChange, onAdd}: {
    query: string; module: AppModule; onModuleChange: (module: AppModule) => void; onQueryChange: (value: string) => void; onAdd: () => void;
}) {
    const search = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const focusSearch = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault(); search.current?.focus(); search.current?.select();
            }
        };
        window.addEventListener('keydown', focusSearch);
        return () => window.removeEventListener('keydown', focusSearch);
    }, []);
    const noun = module === 'game' ? '游戏' : '服务';
    return <header className="titlebar">
        <div className="module-switcher" role="tablist" aria-label="LAL 模块">
            <button type="button" role="tab" aria-selected={module === 'service'} className={module === 'service' ? 'is-active' : ''}
                onClick={() => onModuleChange('service')}><ServerCog size={14}/><span>服务</span></button>
            <button type="button" role="tab" aria-selected={module === 'game'} className={module === 'game' ? 'is-active' : ''}
                onClick={() => onModuleChange('game')}><Gamepad2 size={14}/><span>游戏</span></button>
        </div>
        <label className="search-field titlebar-search">
            <Search size={15}/>
            <input ref={search} value={query} onChange={event => onQueryChange(event.target.value)} placeholder={`搜索${noun}`} aria-label={`搜索${noun}`}/>
            {query ? <button type="button" onClick={() => onQueryChange('')} aria-label="清除搜索" title="清除搜索"><X size={14}/></button> : <kbd>⌘ F</kbd>}
        </label>
        <button className="button primary titlebar-add" type="button" onClick={onAdd} aria-label={`添加${noun}`}><Plus size={16}/>添加{noun}</button>
    </header>;
}
