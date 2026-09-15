import {cpuScale, formatCPU, formatMemory, isActive, memoryScale} from '../utils';
import type {ResourceUsage, ServiceView} from '../types';

export default function ResourceMonitor({service, usage, history}: {service: ServiceView | null; usage?: ResourceUsage; history: ResourceUsage[]}) {
    const cpuValues = history.map(sample => sample.cpuPercent);
    const memoryValues = history.map(sample => sample.memoryBytes);
    const active = service ? isActive(service) : false;
    return <section className="resource-monitor" aria-label={service ? `${service.name} 资源趋势` : '资源趋势'}>
        <div className="resource-identity">
            <span className="resource-kicker">TELEMETRY</span>
            <span className={active ? 'resource-live is-active' : 'resource-live'}><span/>{active ? 'LIVE' : 'IDLE'}</span>
            <span className="resource-processes">PROC {usage?.processCount ?? 0}</span>
            <span className="resource-window">120 SEC</span>
        </div>
        <TrendMetric label="CPU" value={usage?.cpuPercent ?? 0} values={cpuValues} kind="cpu"/>
        <TrendMetric label="RSS" value={usage?.memoryBytes ?? 0} values={memoryValues} kind="memory"/>
    </section>;
}

function TrendMetric({label, value, values, kind}: {label: string; value: number; values: number[]; kind: 'cpu' | 'memory'}) {
    const scale = kind === 'cpu' ? cpuScale(values) : memoryScale(values);
    const chartValues = values.length === 1 ? [values[0], values[0]] : values;
    const points = chartValues.map((point, index) => {
        const x = chartValues.length <= 1 ? 240 : index * 240 / (chartValues.length - 1);
        const y = 45 - Math.min(point / scale, 1) * 39;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const currentPoint = points.split(' ').at(-1)?.split(',') ?? ['240', '45'];
    const formattedValue = kind === 'cpu' ? formatCPU(value) : formatMemory(value);
    const formattedScale = kind === 'cpu' ? formatCPU(scale) : formatMemory(scale);
    return <div className={`trend-metric is-${kind}`}>
        <div className="trend-heading"><span>{label}</span><strong>{formattedValue}</strong><small>CEIL {formattedScale}</small></div>
        <svg className="trend-chart" viewBox="0 0 240 50" preserveAspectRatio="none" role="img" aria-label={`${label} 当前 ${formattedValue}`}>
            <g className="trend-grid"><line x1="0" y1="12" x2="240" y2="12"/><line x1="0" y1="25" x2="240" y2="25"/><line x1="0" y1="38" x2="240" y2="38"/><line x1="60" y1="0" x2="60" y2="50"/><line x1="120" y1="0" x2="120" y2="50"/><line x1="180" y1="0" x2="180" y2="50"/></g>
            {points && <polyline className="trend-line" points={points}/>}
            {points && <circle className="trend-point" cx={currentPoint[0]} cy={currentPoint[1]} r="2.2"/>}
        </svg>
    </div>;
}
