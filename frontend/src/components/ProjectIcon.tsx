import {Atom, Box, Code2, Gamepad2, Package, TerminalSquare, Zap} from 'lucide-react';
import type {ReactNode} from 'react';

const projectTypeLabels: Record<string, string> = {
    nextjs: 'Next.js',
    vite: 'Vite',
    react: 'React',
    vue: 'Vue',
    svelte: 'Svelte',
    angular: 'Angular',
    go: 'Go',
    rust: 'Rust',
    python: 'Python',
    node: 'Node.js',
    godot: 'Godot',
    unity: 'Unity',
    phaser: 'Phaser',
    generic: '本地服务',
};

function NextMark() {
    return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="11"/>
        <path d="M7.3 7.2h2.35l5.05 6.35V7.2h2v9.6h-2.2L9.35 10.3v6.5h-2.05z"/>
    </svg>;
}

export default function ProjectIcon({projectType, projectName, iconURL}: {projectType?: string; projectName: string; iconURL?: string}) {
    const type = projectType || 'generic';
    const label = projectTypeLabels[type] ?? '项目';
    if (iconURL) {
        return <span className={`project-icon project-icon-logo`} role="img" aria-label={`${projectName}：${label}`} title={label}>
            <img className="project-logo" src={iconURL} alt="" draggable={false}/>
        </span>;
    }
    let mark: ReactNode = <TerminalSquare size={17}/>;
    if (type === 'nextjs') mark = <NextMark/>;
    else if (type === 'react') mark = <Atom size={17}/>;
    else if (type === 'vite') mark = <Zap size={17}/>;
    else if (type === 'vue' || type === 'svelte' || type === 'angular') mark = <Code2 size={17}/>;
    else if (type === 'go' || type === 'rust') mark = <Box size={17}/>;
    else if (type === 'godot' || type === 'unity' || type === 'phaser') mark = <Gamepad2 size={17}/>;
    else if (type === 'python' || type === 'node') mark = <Package size={17}/>;
    return <span className={`project-icon project-icon-${type}`} role="img" aria-label={`${projectName}：${label}`} title={label}>{mark}</span>;
}
