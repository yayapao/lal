import {LoaderCircle, Play, RefreshCw, Square} from 'lucide-react';
import type {BatchBusyState} from '../types';

export default function ServiceToolbar({total, running, external = 0, refreshing, batchBusy, onRefresh, onBatch}: {
    total: number; running: number; external?: number; refreshing: boolean; batchBusy: BatchBusyState;
    onRefresh: () => void; onBatch: (action: 'start' | 'stop') => void;
}) {
    return <div className="toolbar service-toolbar">
        <div className="summary"><span className="service-library-label">服务台</span><span><i className="status-dot"/><strong>{running}</strong> / {total} 运行</span>{external > 0 && <span title="由其他工具启动的服务">外部 {external}</span>}</div>
        <div className="toolbar-actions">
            <button className="icon-button subtle" type="button" onClick={onRefresh} aria-label="刷新状态" title="刷新状态" disabled={refreshing || batchBusy !== null}><RefreshCw className={refreshing ? 'spin' : ''} size={15}/></button>
            <button className="button secondary batch-stop" type="button" onClick={() => onBatch('stop')} disabled={batchBusy !== null || running === 0}>
                {batchBusy === 'all-stop' ? <LoaderCircle className="spin" size={14}/> : <Square size={11}/>}全部停止
            </button>
            <button className="button secondary batch-start" type="button" onClick={() => onBatch('start')} disabled={batchBusy !== null || total === 0 || running === total}>
                {batchBusy === 'all-start' ? <LoaderCircle className="spin" size={14}/> : <Play size={12}/>}全部启动
            </button>
        </div>
    </div>;
}
