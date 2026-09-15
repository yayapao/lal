import {ExternalLink, MessageSquarePlus, Pencil, RefreshCw, Trash2} from 'lucide-react';
import {isActive} from '../utils';
import type {MenuState, ServiceView} from '../types';

export default function ContextMenu({menu, cacheBusy, onClose, onPromptManager, onEdit, onRestart, onCache, onReveal, onRemove}: {
    menu: MenuState;
    cacheBusy: boolean;
    onClose: () => void;
    onPromptManager: (service: ServiceView) => void;
    onEdit: (service: ServiceView) => void;
    onRestart: (service: ServiceView) => void;
    onCache: (service: ServiceView) => void;
    onReveal: (service: ServiceView) => void;
    onRemove: (service: ServiceView) => void;
}) {
    return <>
        <button className="menu-scrim" type="button" onClick={onClose} aria-label="关闭菜单"/>
        <div className="context-menu" role="menu" style={{left: menu.left, top: menu.top}}>
            <button type="button" role="menuitem" onClick={() => onPromptManager(menu.service)} disabled={!menu.service.pathExists}><MessageSquarePlus size={15}/>Prompt 启动</button>
            <button type="button" role="menuitem" onClick={() => onEdit(menu.service)} disabled={isActive(menu.service)}><Pencil size={15}/>编辑配置</button>
            <button type="button" role="menuitem" onClick={() => void onRestart(menu.service)} disabled={menu.service.status === 'starting' || menu.service.status === 'stopping' || !menu.service.pathExists}><RefreshCw size={15}/>重启服务</button>
            <button type="button" role="menuitem" onClick={() => onCache(menu.service)} disabled={cacheBusy || menu.service.status === 'starting' || menu.service.status === 'stopping' || !menu.service.pathExists}><Trash2 size={15}/>执行缓存清理</button>
            <button type="button" role="menuitem" onClick={() => void onReveal(menu.service)}><ExternalLink size={15}/>在 Finder 中显示</button>
            <button className="danger-item" type="button" role="menuitem" onClick={() => onRemove(menu.service)} disabled={isActive(menu.service)}><Trash2 size={15}/>移除服务</button>
        </div>
    </>;
}
