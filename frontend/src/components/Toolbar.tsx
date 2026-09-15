import {Activity, LoaderCircle, Play, Plus, RefreshCw, Search, Square, X} from 'lucide-react';
import type {BatchBusyState} from '../types';

export default function Toolbar({query, onQueryChange, total, running, ready, refreshing, batchBusy, onRefresh, onBatch, onAdd}: {
    query: string;
    onQueryChange: (value: string) => void;
    total: number;
    running: number;
    ready: number;
    refreshing: boolean;
    batchBusy: BatchBusyState;
    onRefresh: () => void;
    onBatch: (action: 'start' | 'stop') => void;
    onAdd: () => void;
}) {
    return <>
        <header className="titlebar">
            <label className="search-field titlebar-search">
                <Search size={16}/>
                <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="搜索服务" aria-label="搜索服务"/>
                {query && <button type="button" onClick={() => onQueryChange('')} aria-label="清除搜索" title="清除搜索"><X size={14}/></button>}
            </label>
        </header>

        <div className="toolbar">
            <div className="summary">
                <Activity size={17}/><span><strong>{total}</strong> SERVICES</span>
                <span className="summary-separator"/><span><strong>{running}</strong> RUNNING</span>
                <span className="summary-separator"/><span><strong>{ready}</strong> READY</span>
            </div>
            <div className="toolbar-actions">
                <button className={refreshing ? 'icon-button subtle is-pressed' : 'icon-button subtle'} type="button" onClick={onRefresh}
                    aria-label="刷新状态" title="刷新状态" disabled={refreshing || batchBusy !== null}>{refreshing ? <RefreshCw className="spin" size={16}/> : <RefreshCw size={16}/>}</button>
                <button className="button secondary" type="button" onClick={() => onBatch('stop')} disabled={batchBusy !== null || running === 0}>
                    {batchBusy === 'all-stop' ? <LoaderCircle className="spin" size={16}/> : <Square size={14}/>}全部停止
                </button>
                <button className="button primary" type="button" onClick={() => onBatch('start')} disabled={batchBusy !== null || total === 0 || running === total}>
                    {batchBusy === 'all-start' ? <LoaderCircle className="spin" size={16}/> : <Play size={16}/>}全部启动
                </button>
                <button className="icon-button add-button" type="button" onClick={onAdd} aria-label="添加服务" title="添加服务"><Plus size={19}/></button>
            </div>
        </div>
    </>;
}
