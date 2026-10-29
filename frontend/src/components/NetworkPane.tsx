import {ArrowLeft, Cable, ChevronRight, Clock3, Network, RefreshCw, Wifi} from 'lucide-react';
import {useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import type {NetworkState} from '../hooks/useNetworkInfo';
import type {NetworkInterface} from '../types';
import NetworkCopyButton from './NetworkCopyButton';

const tabs = ['概览', '接口', 'ifconfig'] as const;

function NetworkField({label, value, onError}: {label: string; value: string; onError: (message: string) => void}) {
    return <div className="network-field"><dt title={label === 'DNS 服务器' ? '系统当前解析器，包括 VPN 和按域名匹配的解析器' : undefined}>{label}</dt><dd>
        <span className={value ? '' : 'network-unavailable'}>{value || '—'}</span>
        <NetworkCopyButton label={label} value={value} onError={onError}/>
    </dd></div>;
}

function InterfaceHeader({item}: {item: NetworkInterface}) {
    const connected = item.up && (item.ipv4.length > 0 || item.ipv6.length > 0);
    const Icon = item.label === 'Wi-Fi' ? Wifi : item.hardware ? Cable : Network;
    return <div className="network-interface-header">
        <span className="network-interface-icon"><Icon size={23}/></span>
        <div><strong>{item.label}</strong><small className={connected ? 'is-connected' : ''}>
            <i className="status-dot"/>{connected ? '已连接' : '未连接'}{item.loopback ? ' · 回环' : ''}
        </small></div><code>{item.name}</code>
    </div>;
}

function InterfaceFields({item, onError}: {item: NetworkInterface; onError: (message: string) => void}) {
    return <>
        <NetworkField label="IPv4 地址" value={item.ipv4.join('\n')} onError={onError}/>
        <NetworkField label="网关" value={item.gateway} onError={onError}/>
        <NetworkField label="子网掩码" value={item.subnetMask} onError={onError}/>
        <NetworkField label="IPv6 地址" value={item.ipv6.join('\n')} onError={onError}/>
        <NetworkField label="MAC 地址" value={item.mac} onError={onError}/>
        <NetworkField label="MTU" value={String(item.mtu)} onError={onError}/>
    </>;
}

export default function NetworkPane({network, onBack, onError}: {
    network: NetworkState; onBack: () => void; onError: (message: string) => void;
}) {
    const {data, loading, error, refresh} = network;
    const [tab, setTab] = useState(0);
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const primary = data?.interfaces.find(item => item.name === data.primaryInterface);
    const warnings = [error && `${data ? '当前为上次读取的数据；' : ''}${error}`, ...(data?.warnings ?? [])].filter(Boolean);
    const changeTab = (event: KeyboardEvent, index: number) => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault(); setTab(next); tabRefs.current[next]?.focus();
    };
    const checkedAt = data?.checkedAt ? new Date(data.checkedAt).toLocaleTimeString('zh-CN', {hour12: false}) : '';
    return <section className="network-pane" aria-label="网络详情">
        <div className="network-toolbar">
            <div className="network-tabs" role="tablist" aria-label="网络详情视图">
                {tabs.map((label, index) => <button key={label} type="button" role="tab" id={`network-tab-${index}`}
                    aria-selected={tab === index} aria-controls={`network-panel-${index}`} tabIndex={tab === index ? 0 : -1}
                    ref={node => { tabRefs.current[index] = node; }} onKeyDown={event => changeTab(event, index)} onClick={() => setTab(index)}>{label}</button>)}
            </div>
            <div className="network-toolbar-actions">
                <button className="icon-button subtle" type="button" aria-label="刷新网络信息" title="刷新网络信息" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'spin' : ''}/></button>
                <button className="text-button network-back" type="button" onClick={onBack}><ArrowLeft size={15}/>返回服务</button>
            </div>
        </div>
        <div className="network-body">
            {warnings.length > 0 && <div className="network-warning" role="status">{warnings.join('；')}</div>}
            {!data && <div className="network-empty">{loading ? '正在读取网络信息…' : '暂时无法读取，请刷新重试'}</div>}
            {data && <>
                <div className="network-tab-panel" role="tabpanel" id="network-panel-0" aria-labelledby="network-tab-0" tabIndex={0} hidden={tab !== 0}>
                    <div className="network-card">
                        {primary ? <InterfaceHeader item={primary}/> : <div className="network-offline"><Wifi size={21}/><span>未检测到局域网连接</span></div>}
                        <dl>{primary && <InterfaceFields item={primary} onError={onError}/>}
                            <NetworkField label="DNS 服务器" value={data.dns.join('\n')} onError={onError}/>
                            <NetworkField label="主机名" value={data.hostname} onError={onError}/>
                        </dl>
                    </div>
                    <button className="network-other" type="button" onClick={() => { setTab(1); tabRefs.current[1]?.focus(); }}><Network size={18}/><span>其他接口</span><small>{data.interfaces.length - (primary ? 1 : 0)}</small><ChevronRight size={16}/></button>
                </div>
                <div className="network-tab-panel" role="tabpanel" id="network-panel-1" aria-labelledby="network-tab-1" tabIndex={0} hidden={tab !== 1}>
                    {data.interfaces.length === 0 && <div className="network-empty">没有可用的网络接口</div>}
                    {data.interfaces.map(item => <details className="network-card network-interface" key={item.name}>
                        <summary><InterfaceHeader item={item}/><ChevronRight size={15}/></summary>
                        <dl><InterfaceFields item={item} onError={onError}/></dl>
                    </details>)}
                </div>
                <div className="network-tab-panel" role="tabpanel" id="network-panel-2" aria-labelledby="network-tab-2" tabIndex={0} hidden={tab !== 2}>
                    <div className="network-raw-toolbar"><code>ifconfig -a</code><NetworkCopyButton label="ifconfig 输出" value={data.ifconfig} onError={onError}/></div>
                    <pre className="network-raw">{data.ifconfig || '未获取到 ifconfig 输出'}</pre>
                </div>
            </>}
        </div>
        <footer className="network-footer"><span><Clock3 size={12}/>{checkedAt ? `更新于 ${checkedAt}` : '尚未更新'}{error && data ? ' · 旧数据' : ''}</span>
            <span><i className={`status-dot${error ? ' has-error' : ''}`}/>{loading ? '刷新中' : error ? '刷新失败' : '自动刷新'}</span>
        </footer>
    </section>;
}
