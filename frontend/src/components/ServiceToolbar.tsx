import {LoaderCircle, Play, RefreshCw, Square} from 'lucide-react';
import type {BatchBusyState} from '../types';

export default function ServiceToolbar({total, running, refreshing, batchBusy, onRefresh, onBatch}: {
    total: number; running: number; refreshing: boolean; batchBusy: BatchBusyState;
    onRefresh: () => void; onBatch: (action: 'start' | 'stop') => void;
}) {
    return <div className="toolbar service-toolbar">
        <div className="summary"><span>{total} 个服务</span><span><i className="status-dot"/>{running} 个运行中</span></div>
        <div className="toolbar-actions">
            <button className="icon-button subtle" type="button" onClick={onRefresh} aria-label="刷新状态" title="刷新状态" disabled={refreshing || batchBusy !== null}><RefreshCw className={refreshing ? 'spin' : ''} size={15}/></button>
            <button className="button secondary" type="button" onClick={() => onBatch('stop')} disabled={batchBusy !== null || running === 0}>
                {batchBusy === 'all-stop' ? <LoaderCircle className="spin" size={14}/> : <Square size={11}/>}全部停止
            </button>
            <button className="button secondary" type="button" onClick={() => onBatch('start')} disabled={batchBusy !== null || total === 0 || running === total}>
                {batchBusy === 'all-start' ? <LoaderCircle className="spin" size={14}/> : <Play size={12}/>}全部启动
            </button>
        </div>
    </div>;
}
