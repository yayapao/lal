import {Gamepad2, LibraryBig, LoaderCircle, Plus, RefreshCw} from 'lucide-react';
import type {ReactNode} from 'react';
import GameCard from './GameCard';
import type {ResourceUsage, ServiceView} from '../types';
import {isActive} from '../utils';

export default function GamesPane({loading, query, total, games, selectedId, busyIds, refreshing, iconURLs, resourceUsage, footer,
    onAdd, onRefresh, onSelect, onToggle, onModeChange, onOpenVSCode, onReveal, onOpenURL, onMenu}: {
    loading: boolean; query: string; total: number; games: ServiceView[]; selectedId: string; busyIds: Set<string>; refreshing: boolean;
    iconURLs: Record<string, string>; resourceUsage: Record<string, ResourceUsage>; footer: ReactNode;
    onAdd: () => void; onRefresh: () => void; onSelect: (id: string) => void; onToggle: (game: ServiceView) => void;
    onModeChange: (game: ServiceView, mode: 'release' | 'debug') => void;
    onOpenVSCode: (game: ServiceView) => void; onReveal: (game: ServiceView) => void; onOpenURL: (game: ServiceView) => void;
    onMenu: (event: React.MouseEvent<HTMLButtonElement>, game: ServiceView) => void;
}) {
    const running = games.filter(game => isActive(game) || (!game.port?.previewOnly && game.port?.matchesProject)).length;
    return <section className="games-pane" aria-label="游戏列表">
        <header className="game-library-head">
            <div className="game-library-title"><span><Gamepad2 size={14}/>PLAY LIBRARY</span><div className="game-title-line"><strong>游戏库</strong><small>启动、预览、继续玩</small></div></div>
            <div className="game-library-stats"><span className="game-library-count"><b>{query ? `${games.length}/${total}` : String(total).padStart(2, '0')}</b> GAMES</span><span className="game-running-count"><i className="status-dot"/><b>{String(running).padStart(2, '0')}</b> RUNNING</span><button className="icon-button subtle" type="button" onClick={onRefresh} disabled={refreshing} aria-label="刷新游戏状态" title="刷新游戏状态"><RefreshCw className={refreshing ? 'spin' : ''} size={15}/></button></div>
        </header>
        <div className="games-scroll">
            {loading ? <div className="game-loading" aria-label="正在载入游戏"><LoaderCircle className="spin" size={20}/><span>载入游戏库</span></div>
                : games.length === 0 ? <div className="games-empty"><span className="games-empty-mark"><LibraryBig size={25}/><i/><i/><i/></span><h2>{query ? '没有匹配的游戏' : '建立你的游戏库'}</h2>
                    <p>{query ? '换一个名称、引擎或目录关键词。' : '添加 Godot、Unity 或 Web 游戏，集中管理启动命令和预览地址。'}</p>
                    {!query && <button className="button primary" type="button" onClick={onAdd}><Plus size={15}/>添加游戏</button>}</div>
                : <div className="game-grid">{games.map((game, index) => <GameCard key={game.id} service={game} index={index}
                    selected={game.id === selectedId} busy={busyIds.has(game.id)} usage={resourceUsage[game.id]} iconURL={iconURLs[game.id]}
                    onModeChange={mode => onModeChange(game, mode)}
                    onSelect={() => onSelect(game.id)} onToggle={() => onToggle(game)} onOpenVSCode={() => onOpenVSCode(game)}
                    onReveal={() => onReveal(game)} onOpenURL={() => onOpenURL(game)} onMenu={event => onMenu(event, game)}/>)}</div>}
        </div>
        {footer}
    </section>;
}
