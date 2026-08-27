import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {LogLine, parseLogText} from './LogLine';

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
});
