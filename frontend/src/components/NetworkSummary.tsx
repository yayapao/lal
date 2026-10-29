import {ChevronRight, CircleAlert} from 'lucide-react';
import type {NetworkState} from '../hooks/useNetworkInfo';
import NetworkCopyButton from './NetworkCopyButton';

export default function NetworkSummary({network, active, onDetails, onError}: {
    network: NetworkState; active: boolean; onDetails: () => void; onError: (message: string) => void;
}) {
    const {data, loading, error} = network;
    const primary = data?.interfaces.find(item => item.name === data.primaryInterface);
    const warning = error || data?.warnings.join('；');
    const fields = [
        {label: '局域网 IPv4', value: primary?.ipv4[0] ?? '', empty: '未连接'},
        {label: '网关', value: primary?.gateway ?? '', empty: '未获取'},
    ];
    return <footer className={`network-summary${error ? ' is-stale' : ''}`} aria-label="常用网络信息">
        {fields.map(({label, value, empty}, index) => <div className="network-summary-field" key={label}>
            <span className="network-summary-label">{label}{index === 0 && warning && <span title={warning}>
                <CircleAlert size={11}/><span className="sr-only">{error && data ? '旧数据：' : ''}{warning}</span>
            </span>}{index === 0 && error && data && <em>旧数据</em>}</span>
            <div><span className={value ? 'network-summary-value' : 'network-summary-empty'}>{value || (loading && !data ? '读取中…' : empty)}</span>
                <NetworkCopyButton value={value} label={label} onError={onError}/></div>
        </div>)}
        <button type="button" className="network-details-button" aria-label="查看网络详情" aria-pressed={active} onClick={onDetails}>详情<ChevronRight size={13}/></button>
    </footer>;
}
