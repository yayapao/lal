import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {groupLogEntries, LogLine, parseLogText} from './LogLine';

describe('LogLine', () => {
    afterEach(cleanup);

    it('highlights service and structured Pino error metadata', () => {
        const entry = {
            timestamp: '2026-08-27T17:43:41+08:00',
            stream: 'stdout',
            text: '[api] {"level":50,"pid":79910,"hostname":"YAYAMac-6.local","err":{"message":"connect ETIMEDOUT 101.47.21.19:5000","code":"ETIMEDOUT","address":"101.47.21.19","port":5000},"msg":"connect ETIMEDOUT 101.47.21.19:5000"}',
        };

        render(<LogLine entry={entry} fallbackService="Alpha"/>);

        expect(screen.getByText('api')).toBeDefined();
        expect(screen.getByText('ERROR')).toBeDefined();
        expect(screen.getAllByText('ETIMEDOUT')).toHaveLength(2);
        expect(screen.getAllByText('101.47.21.19:5000')).toHaveLength(2);
        expect(screen.getByText('79910')).toBeDefined();
        expect(screen.getByText('YAYAMac-6.local')).toBeDefined();
        expect(screen.getByLabelText('查看结构化日志详情')).toBeDefined();
    });

    it('infers plain-text error status and keeps the service prefix separate', () => {
        const parsed = parseLogText('[agents] Failed to start worker Error: connect ETIMEDOUT 101.47.21.19:5000', 'stdout');

        expect(parsed.service).toBe('agents');
        expect(parsed.severity).toBe('error');
        expect(parsed.message).not.toContain('[agents]');
        expect(parsed.metadata).toContainEqual({label: 'CODE', value: 'ETIMEDOUT', tone: 'error'});
    });

    it('preserves ANSI text while removing control sequences from parsing', () => {
        const entry = {
            timestamp: '2026-08-27T17:45:10+08:00',
            stream: 'stdout',
            text: '\u001b[32mready\u001b[0m',
        };

        render(<LogLine entry={entry} fallbackService="api"/>);

        expect(screen.getByText('ready')).toBeDefined();
        expect(screen.getByText('OK')).toBeDefined();
    });

    it('promotes an info-level startup failure to error severity', () => {
        const parsed = parseLogText('[api] {"level":30,"signal":"startup failure","msg":"Stopping control-api"}', 'stdout');

        expect(parsed.severity).toBe('error');
        expect(parsed.metadata).toContainEqual({label: 'STATUS', value: 'startup failure', tone: 'error'});
    });

    it('structures a Next.js request with timing phases', () => {
        const entry = {
            timestamp: '2026-08-27T18:20:00+08:00',
            stream: 'stdout',
            text: 'GET /admin 200 in 501ms (next.js: 88ms, proxy.ts: 114ms, application-code: 299ms)',
        };

        render(<LogLine entry={entry} fallbackService="web"/>);

        expect(screen.getByText('/admin')).toBeDefined();
        expect(screen.getByText('GET')).toBeDefined();
        expect(screen.getByText('HTTP')).toBeDefined();
        expect(screen.getByText('200')).toBeDefined();
        expect(screen.getByText('TOTAL')).toBeDefined();
        expect(screen.getByText('501ms')).toBeDefined();
        expect(screen.getByText('next.js')).toBeDefined();
        expect(screen.getByText('88ms')).toBeDefined();
        expect(screen.getByText('proxy.ts')).toBeDefined();
        expect(screen.getByText('114ms')).toBeDefined();
        expect(screen.getByText('application-code')).toBeDefined();
        expect(screen.getByText('299ms')).toBeDefined();
    });

    it('marks server errors from request logs as errors', () => {
        const parsed = parseLogText('POST /api/agents 503 in 2.1s', 'stdout');

        expect(parsed.severity).toBe('error');
        expect(parsed.message).toBe('/api/agents');
        expect(parsed.metadata).toContainEqual({label: 'HTTP', value: '503', tone: 'error'});
        expect(parsed.metadata).toContainEqual({label: 'TOTAL', value: '2.1s', tone: 'error'});
    });

    it('groups a short stderr burst into one error block', () => {
        const entries = [
            {timestamp: '2026-08-27T18:04:29.100+08:00', stream: 'stderr', text: "FROM stock_holding_events\\n' + failed"},
            {timestamp: '2026-08-27T18:04:29.120+08:00', stream: 'stderr', text: "GROUP BY stock_id\\n' + failed"},
            {timestamp: '2026-08-27T18:04:30.000+08:00', stream: 'stderr', text: 'a later error'},
        ];

        const grouped = groupLogEntries(entries);

        expect(grouped).toHaveLength(2);
        expect(grouped[0].text).toBe("FROM stock_holding_events\\n' + failed\nGROUP BY stock_id\\n' + failed");
        expect(parseLogText(grouped[0].text, grouped[0].stream).severity).toBe('error');

        render(<LogLine entry={grouped[0]} fallbackService="myStock"/>);

        expect(screen.getAllByText('ERROR')).toHaveLength(1);
        expect(document.querySelector('.log-message')?.textContent).toBe("FROM stock_holding_events\\n' + failed\nGROUP BY stock_id\\n' + failed");
    });

    it('does not mark benign stderr progress as an error', () => {
        const parsed = parseLogText('/tmp/Niu.app: replacing existing signature', 'stderr');

        expect(parsed.severity).toBe('neutral');
        expect(parsed.metadata).toHaveLength(0);
    });
});
