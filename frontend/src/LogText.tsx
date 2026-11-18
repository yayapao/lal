import Anser from 'anser';
import type {CSSProperties, ReactNode} from 'react';
import {errorPattern, successPattern, warningPattern} from './logSemantics';

const tokens = new RegExp([
    `(?<error>${errorPattern.source})`,
    `(?<warning>${warningPattern.source})`,
    '(?<address>(?:\\d{1,3}\\.){3}\\d{1,3}:\\d+)',
    `(?<success>${successPattern.source})`,
    '(?<number>\\b\\d+(?:,\\d{3})*(?:\\.\\d+)?(?:ms|s|KB|MB|GB|KiB|MiB|GiB|%)?)',
].join('|'), 'gi');

export default function LogText({text}: {text: string}) {
    const segments = Anser.ansiToJson(text, {remove_empty: true});
    return <>{segments.map((segment, index) => {
        const style: CSSProperties = {
            color: segment.fg_truecolor || segment.fg ? `rgb(${segment.fg_truecolor || segment.fg})` : undefined,
            backgroundColor: segment.bg_truecolor || segment.bg ? `rgb(${segment.bg_truecolor || segment.bg})` : undefined,
            fontWeight: segment.decorations.includes('bold') ? 700 : undefined,
            fontStyle: segment.decorations.includes('italic') ? 'italic' : undefined,
            textDecoration: segment.decorations.includes('underline') ? 'underline' : undefined,
        };
        return <span style={style} key={index}>{highlightTokens(segment.content)}</span>;
    })}</>;
}

function highlightTokens(content: string) {
    const parts: ReactNode[] = [];
    let offset = 0;
    for (const match of content.matchAll(tokens)) {
        const index = match.index;
        const token = match[0];
        const kind = Object.keys(match.groups ?? {}).find(key => match.groups?.[key] !== undefined);
        // Keep hashes, identifiers, paths, versions and timestamps intact.
        if (kind === 'number' && (/[A-Za-z\d_./\\:-]/.test(content[index - 1] ?? '')
            || /[A-Za-z\d_./\\:-]/.test(content[index + token.length] ?? ''))) continue;
        parts.push(content.slice(offset, index));
        parts.push(kind === 'number'
            ? <strong className="log-number" key={index}>{token}</strong>
            : <mark className={`log-emphasis is-${kind}`} key={index}>{token}</mark>);
        offset = index + token.length;
    }
    parts.push(content.slice(offset));
    return parts;
}
