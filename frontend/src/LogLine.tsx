import Anser from 'anser';
import {memo, useMemo} from 'react';
import LogText from './LogText';
import {inferSeverity, type Severity} from './logSemantics';

export type LogLineEntry = {
    timestamp: string;
    stream: string;
    text: string;
};

const logBlockGapMs = 250;

type LogMeta = {label: string; value?: string; tone?: Severity};
type ParsedLog = {
    service: string;
    message: string;
    severity: Severity;
    metadata: LogMeta[];
    details: string;
    kind?: 'http';
};

const servicePrefix = /^\[([^\]\r\n]{1,40})\]\s*(.*)$/s;
const httpRequestPattern = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)\s+(\d{3})\s+in\s+(\d+(?:\.\d+)?(?:ms|s))(?:\s+\((.+)\))?$/i;
const httpPhasePattern = /^\s*([^:]+):\s*(\d+(?:\.\d+)?(?:ms|s))\s*$/i;

export const LogLine = memo(function LogLine({entry, fallbackService, failurePosition = ''}: {entry: LogLineEntry; fallbackService: string; failurePosition?: string}) {
    const parsed = useMemo(() => parseLogText(entry.text, entry.stream), [entry.stream, entry.text]);
    const service = parsed.service || fallbackService;
    const streamLabel = entry.stream === 'stderr' && parsed.severity === 'error' ? 'ERR' : entry.stream === 'system' ? 'LAL' : 'OUT';
    return <div className={`log-line stream-${entry.stream} is-${parsed.severity}${parsed.kind ? ` is-${parsed.kind}` : ''}${failurePosition ? ` in-failure failure-${failurePosition}` : ''}`}>
        <time dateTime={entry.timestamp} title={formatFullTimestamp(entry.timestamp)}>{formatLogTime(entry.timestamp)}</time>
        <span className="stream-mark">{streamLabel}</span>
        <span className={`log-service service-color-${serviceColor(service)}`} title={service}>{service}</span>
        <span className="log-content">
            <span className="log-message"><LogText text={parsed.message || ' '}/></span>
            {parsed.metadata.length > 0 && <span className="log-metadata">
                {parsed.metadata.map((item, index) => <span className={`log-meta-chip${item.tone ? ` is-${item.tone}` : ''}`} key={`${item.label}-${item.value ?? ''}-${index}`}>
                    <span>{item.label}</span>{item.value && <strong>{item.value}</strong>}
                </span>)}
            </span>}
            {parsed.details && <details className="log-details">
                <summary aria-label="查看结构化日志详情">JSON</summary>
                <pre>{parsed.details}</pre>
            </details>}
        </span>
    </div>;
});

/** Group adjacent error lines emitted as one short-lived stderr burst. */
export function groupLogEntries(entries: LogLineEntry[]): LogLineEntry[] {
    const grouped: LogLineEntry[] = [];
    let previousEntry: LogLineEntry | undefined;
    for (const entry of entries) {
        const previous = grouped[grouped.length - 1];
        if (!previous || !previousEntry || !canJoinErrorEntries(previousEntry, entry)) {
            grouped.push({...entry});
        } else {
            previous.text = `${previous.text}\n${entry.text}`;
        }
        previousEntry = entry;
    }
    return grouped;
}

function canJoinErrorEntries(previous: LogLineEntry, next: LogLineEntry) {
    if (previous.stream !== next.stream) return false;
    const previousParsed = parseLogText(previous.text, previous.stream);
    const nextParsed = parseLogText(next.text, next.stream);
    if (previousParsed.severity !== 'error' || nextParsed.severity !== 'error') return false;
    if (previousParsed.service && nextParsed.service && previousParsed.service !== nextParsed.service) return false;
    const previousTime = Date.parse(previous.timestamp);
    const nextTime = Date.parse(next.timestamp);
    if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return false;
    const gap = nextTime - previousTime;
    return gap >= 0 && gap <= logBlockGapMs;
}

export function parseLogText(text: string, stream: string): ParsedLog {
    const plainText = Anser.ansiToText(text);
    const match = plainText.match(servicePrefix);
    const service = match?.[1]?.trim() ?? '';
    const payload = (match?.[2] ?? plainText).trimEnd();
    const rawPayload = service ? text.replace(/^\[[^\]\r\n]{1,40}\]\s*/, '') : text;
    const structured = parseJSONObject(payload.trim());

    if (!structured) {
        const request = parseHTTPRequest(payload);
        if (request) return {...request, service};
        const severity = inferSeverity(payload, stream);
        const metadata: LogMeta[] = [];
        if (severity !== 'neutral') metadata.push({label: severityLabel(severity), tone: severity});
        const code = payload.match(/\b(?:ETIMEDOUT|CONNECT_TIMEOUT|ECONNREFUSED|EADDRINUSE)\b/i)?.[0];
        if (code) metadata.push({label: 'CODE', value: code.toUpperCase(), tone: 'error'});
        return {service, message: rawPayload.trimEnd(), severity, metadata, details: ''};
    }

    const error = asRecord(structured.err);
    const signal = stringValue(structured.signal);
    const inferredSeverity = inferSeverity([
        stringValue(structured.msg),
        stringValue(error?.message),
        signal,
    ].filter(Boolean).join(' '), stream);
    const severity = strongestSeverity(severityFromLevel(structured.level), inferredSeverity);
    const metadata: LogMeta[] = [];
    const level = levelLabel(structured.level);
    if (level) metadata.push({label: level, tone: severityFromLevel(structured.level) ?? severity});

    if (signal) metadata.push({label: 'STATUS', value: signal, tone: inferSeverity(signal, stream)});

    const code = stringValue(error?.code) || stringValue(structured.code);
    if (code) metadata.push({label: 'CODE', value: code, tone: 'error'});

    const address = stringValue(error?.address) || stringValue(structured.address);
    const port = numberOrString(error?.port) || numberOrString(structured.port);
    if (address) metadata.push({label: 'TARGET', value: port ? `${address}:${port}` : address, tone: code ? 'error' : undefined});

    const pid = numberOrString(structured.pid);
    if (pid) metadata.push({label: 'PID', value: pid});
    const hostname = stringValue(structured.hostname);
    if (hostname) metadata.push({label: 'HOST', value: hostname});

    const message = stringValue(structured.msg)
        || stringValue(structured.message)
        || stringValue(error?.message)
        || payload;
    return {service, message, severity, metadata, details: JSON.stringify(structured, null, 2)};
}

function parseHTTPRequest(payload: string): Omit<ParsedLog, 'service'> | null {
    const match = payload.match(httpRequestPattern);
    if (!match) return null;

    const [, method, path, statusText, total, phaseText] = match;
    const status = Number(statusText);
    const statusTone = httpStatusTone(status);
    const metadata: LogMeta[] = [
        {label: method.toUpperCase(), tone: 'info'},
        {label: 'HTTP', value: statusText, tone: statusTone},
        {label: 'TOTAL', value: total, tone: durationTone(total)},
    ];
    for (const phase of phaseText?.split(',') ?? []) {
        const phaseMatch = phase.match(httpPhasePattern);
        if (phaseMatch) metadata.push({label: phaseMatch[1].trim(), value: phaseMatch[2], tone: durationTone(phaseMatch[2])});
    }
    return {message: path, severity: statusTone, metadata, details: '', kind: 'http'};
}

function parseJSONObject(value: string): Record<string, unknown> | null {
    if (!value.startsWith('{') || !value.endsWith('}')) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return asRecord(parsed);
    } catch {
        return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function severityFromLevel(level: unknown): Severity | null {
    if (typeof level === 'number') {
        if (level >= 50) return 'error';
        if (level >= 40) return 'warn';
        if (level >= 30) return 'info';
        if (level >= 10) return 'debug';
    }
    if (typeof level !== 'string') return null;
    const normalized = level.toLowerCase();
    if (normalized === 'fatal' || normalized === 'error') return 'error';
    if (normalized === 'warn' || normalized === 'warning') return 'warn';
    if (normalized === 'info') return 'info';
    if (normalized === 'debug' || normalized === 'trace') return 'debug';
    return null;
}

function strongestSeverity(...values: Array<Severity | null>) {
    const priority: Record<Severity, number> = {neutral: 0, debug: 1, info: 2, success: 3, warn: 4, error: 5};
    return values.reduce<Severity>((strongest, value) => value && priority[value] > priority[strongest] ? value : strongest, 'neutral');
}

function httpStatusTone(status: number): Severity {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    if (status >= 300) return 'info';
    if (status >= 200) return 'success';
    return 'neutral';
}

function durationTone(duration: string): Severity {
    const milliseconds = Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    if (milliseconds >= 1000) return 'error';
    if (milliseconds >= 500) return 'warn';
    return 'neutral';
}

function levelLabel(level: unknown) {
    if (typeof level === 'number') {
        if (level >= 60) return 'FATAL';
        if (level >= 50) return 'ERROR';
        if (level >= 40) return 'WARN';
        if (level >= 30) return 'INFO';
        if (level >= 20) return 'DEBUG';
        if (level >= 10) return 'TRACE';
    }
    return typeof level === 'string' ? level.toUpperCase() : '';
}

function severityLabel(severity: Severity) {
    return ({error: 'ERROR', warn: 'WARN', success: 'OK', info: 'INFO', debug: 'DEBUG', neutral: ''} as const)[severity];
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value ? value : '';
}

function numberOrString(value: unknown) {
    return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function serviceColor(service: string) {
    return [...service].reduce((total, char) => total + char.charCodeAt(0), 0) % 4;
}

const logTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

function formatLogTime(timestamp: string) {
    const time = new Date(timestamp);
    return Number.isNaN(time.getTime()) ? '--:--:--' : logTimeFormatter.format(time);
}

function formatFullTimestamp(timestamp: string) {
    const time = new Date(timestamp);
    return Number.isNaN(time.getTime()) ? timestamp : time.toLocaleString('zh-CN', {hour12: false});
}

export default LogLine;
