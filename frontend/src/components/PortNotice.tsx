import type {ServiceView} from '../types';

export default function PortNotice({service}: {service: ServiceView}) {
    const port = service.port;
    if (!port) return null;
    const text = `${port.previewOnly ? 'Web 预览' : port.matchesProject ? '外部服务（目录匹配）' : '端口占用'} · PID ${port.pid} · ${port.accessible ? '可连接' : '不可连接'}${port.previewOnly ? ' · 与原生游戏独立' : ''}`;
    return <div className="port-notice" title={`${port.command}\n${port.directory}`}>{text}</div>;
}
