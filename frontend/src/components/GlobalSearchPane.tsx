import {ArrowUpRight, Search} from 'lucide-react';
import type {LaunchTarget, ServiceView} from '../types';
import {categoryOf, moduleOf} from '../types';
import ProjectIcon from './ProjectIcon';
import '../styles/global-search.css';

export default function GlobalSearchPane({query, services, loading, iconURLs, onOpen}: {
    query: string; services: ServiceView[]; loading: boolean; iconURLs: Record<string, string>;
    onOpen: (service: ServiceView, targetId?: string) => void;
}) {
    const keyword = query.trim().toLocaleLowerCase();
    const matches = (values: (string | undefined)[]) => values.some(value => value?.toLocaleLowerCase().includes(keyword));
    const results: {service: ServiceView; target?: LaunchTarget}[] = [];
    for (const service of services) {
        const shared = [service.workspace, service.directory];
        if (matches([...shared, service.name, service.command, service.url, service.projectType])) results.push({service});
        for (const target of service.launchTargets ?? []) {
            if (matches([...shared, service.name, target.name, target.command, target.url])) results.push({service, target});
        }
    }
    return <section className="global-search-pane" aria-label="全局搜索结果">
        <div className="pane-heading"><span>搜索结果</span><span className="service-count">{results.length}</span></div>
        <div className="global-search-list">
            {loading ? <div className="empty-state">正在载入项目…</div> : results.length === 0 ? <div className="empty-state"><Search size={25}/><span>没有匹配的项目或进程</span></div>
                : results.map(({service, target}) => {
                    const label = moduleOf(service) === 'game' ? '游戏' : categoryOf(service) === 'monorepo' ? 'Monorepo' : '普通服务';
                    const name = target ? `${service.name} / ${target.name}` : service.name;
                    return <button className="global-search-result" type="button" key={target ? `${service.id}::${target.id}` : service.id}
                        aria-label={`打开 ${name}`} onClick={() => onOpen(service, target ? `${service.id}::${target.id}` : '')}>
                        <ProjectIcon projectType={service.projectType} projectName={service.name} iconURL={iconURLs[service.id]}/>
                        <span className="global-search-copy"><strong>{target?.name ?? service.name}</strong>
                            <span>{label}{target ? ` · ${service.name}` : ''}{service.workspace ? ` · ${service.workspace}` : ''}</span>
                            <code>{target?.url || target?.command || service.url || service.directory}</code></span>
                        <ArrowUpRight size={14}/>
                    </button>;
                })}
        </div>
    </section>;
}
