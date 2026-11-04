import {portActionLabel} from '../hooks/usePortActions';
import {Code2, FolderOpen, MessageSquarePlus, Pencil, RefreshCw, Trash2} from 'lucide-react';
import {isActive} from '../utils';
import type {MenuState, ServiceView} from '../types';
import {moduleOf} from '../types';

export default function ContextMenu({menu, cacheBusy, onClose, onPromptManager, onEdit, onRestart, onCache, onOpenVSCode, onReveal, onRemove}: {
    menu: MenuState;
    cacheBusy: boolean;
    onClose: () => void;
    onPromptManager: (service: ServiceView) => void;
    onEdit: (service: ServiceView) => void;
    onRestart: (service: ServiceView) => void;
    onCache: (service: ServiceView) => void;
    onOpenVSCode: (service: ServiceView) => void;
    onReveal: (service: ServiceView) => void;
    onRemove: (service: ServiceView) => void;
}) {
    const noun = moduleOf(menu.service) === 'game' ? '游戏' : '服务';
    return <>
        <button className="menu-scrim" type="button" onClick={onClose} aria-label="关闭菜单"/>
        <div className="context-menu" role="menu" style={{left: menu.left, top: menu.top}}>
            <button type="button" role="menuitem" onClick={() => onPromptManager(menu.service)} disabled={!menu.service.pathExists}><MessageSquarePlus size={15}/>Prompt 启动</button>
            <button type="button" role="menuitem" onClick={() => onEdit(menu.service)} disabled={isActive(menu.service)}><Pencil size={15}/>编辑配置</button>
            <button type="button" role="menuitem" onClick={() => void onRestart(menu.service)} disabled={menu.service.status === 'starting' || menu.service.status === 'stopping' || !menu.service.pathExists}><RefreshCw size={15}/>{portActionLabel(menu.service) || `重启${noun}`}</button>
            <button type="button" role="menuitem" onClick={() => onCache(menu.service)} disabled={cacheBusy || menu.service.status === 'starting' || menu.service.status === 'stopping' || !menu.service.pathExists}><Trash2 size={15}/>执行缓存清理</button>
            <button type="button" role="menuitem" onClick={() => void onOpenVSCode(menu.service)} disabled={!menu.service.pathExists}><Code2 size={15}/>在 VS Code 中打开</button>
            <button type="button" role="menuitem" onClick={() => void onReveal(menu.service)}><FolderOpen size={15}/>在 Finder 中显示</button>
            <button className="danger-item" type="button" role="menuitem" onClick={() => onRemove(menu.service)} disabled={isActive(menu.service)}><Trash2 size={15}/>移除{noun}</button>
        </div>
    </>;
}
