import {Plus, Search, X} from 'lucide-react';
import {useEffect, useRef} from 'react';

export default function Toolbar({query, onQueryChange, onAdd}: {
    query: string; onQueryChange: (value: string) => void; onAdd: () => void;
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
    return <header className="titlebar">
        <label className="search-field titlebar-search">
            <Search size={15}/>
            <input ref={search} value={query} onChange={event => onQueryChange(event.target.value)} placeholder="搜索服务" aria-label="搜索服务"/>
            {query ? <button type="button" onClick={() => onQueryChange('')} aria-label="清除搜索" title="清除搜索"><X size={14}/></button> : <kbd>⌘ F</kbd>}
        </label>
        <button className="button primary titlebar-add" type="button" onClick={onAdd} aria-label="添加服务"><Plus size={16}/>添加服务</button>
    </header>;
}
