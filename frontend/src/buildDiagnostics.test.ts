import {describe, expect, it} from 'vitest';
import {analyzeBuildLogs, createRepairPrompt, failurePosition} from './buildDiagnostics';
import type {LogLineEntry} from './LogLine';
import {alphaService} from './testApi';

const service = {...alphaService, module: 'game', buildCommand: 'wrong-default'};
const log = (text: string, stream = 'stdout'): LogLineEntry => ({timestamp: '2026-11-18T18:11:25+08:00', stream, text});
const failed = [
    log('开始构建并导出 [Web · English]：python3 build.py --web --en', 'system'),
    log('asset hashes: passed'),
    log('ERROR: missing import', 'stderr'),
    log('  at scripts/main.gd:42', 'stderr'),
    log('cleaning up temporary output'),
    log('[Web · English] 构建并导出失败：进程已退出，退出码 1', 'system'),
    log('unrelated later output'),
];

describe('build diagnostics', () => {
    it('marks every line from the first error through the exit, including neutral output', () => {
        const {ranges, latest} = analyzeBuildLogs(failed, service);
        expect(latest).toMatchObject({runStart: 0, start: 2, end: 5, command: 'python3 build.py --web --en', name: 'Web · English'});
        expect(failed.map((_, index) => failurePosition(ranges, index))).toEqual(['', '', 'start', 'middle', 'middle', 'end', '']);
        const prompt = createRepairPrompt(service, failed, latest!);
        expect(prompt).toContain('目录：/tmp/alpha');
        expect(prompt).toContain('实际执行命令：python3 build.py --web --en');
        expect(prompt).toContain('at scripts/main.gd:42');
        expect(prompt).toContain('退出码 1');
        expect(prompt).not.toContain('wrong-default');
        expect(prompt).not.toContain('unrelated later output');
    });

    it('extends a live error range and closes it on failure with no explicit error output', () => {
        expect(analyzeBuildLogs(failed.slice(0, 5), {...service, status: 'building'}).ranges[0]).toMatchObject({start: 2, end: 4});
        const result = analyzeBuildLogs([failed[0], failed[1], failed[5]], service);
        expect(failurePosition(result.ranges, 2)).toBe('single');
        expect(result.latest).toBeDefined();
        const traceback = analyzeBuildLogs([failed[0], log('Traceback (most recent call last):', 'stderr'),
            log('  File "build.py", line 42', 'stderr'), log('ValueError: invalid export', 'stderr'), failed[5]], service);
        expect(traceback.latest).toMatchObject({start: 1, end: 4});
    });

    it('resets the repair action on a new run and keeps successful or cancelled runs out of the failure range', () => {
        expect(analyzeBuildLogs([...failed, failed[0]], service).latest).toBeUndefined();
        for (const end of ['构建并导出完成', '构建已取消']) {
            const result = analyzeBuildLogs([...failed.slice(0, 4), log(end, 'system')], service);
            expect(result.ranges).toHaveLength(0);
            expect(result.latest).toBeUndefined();
        }
    });

    it('uses script boundaries while ignoring failure words in unmanaged system messages', () => {
        const result = analyzeBuildLogs([log('已启动 npm 脚本：build:web', 'system'), log('error TS2304: missing name'),
            log('npm 脚本异常退出：进程已退出，退出码 2', 'system')], alphaService);
        expect(result.latest).toMatchObject({start: 1, end: 2, command: "npm run --silent 'build:web'"});
        expect(analyzeBuildLogs([log('error log sample'), log('构建并导出失败：fake', 'stdout')], service).latest).toBeUndefined();
    });

    it('handles a cleared or capped start without claiming that the default command was executed', () => {
        const result = analyzeBuildLogs(failed.slice(2), service);
        expect(result.latest).toMatchObject({start: 0, end: 3, command: ''});
        expect(createRepairPrompt(service, failed.slice(2), result.latest!)).toContain('不要猜测命令');
    });

    it('caps oversized prompts while retaining the first error and process exit', () => {
        const entries = [failed[0], failed[2], ...Array.from({length: 500}, () => log('x'.repeat(500))), failed[5]];
        const result = analyzeBuildLogs(entries, service);
        const prompt = createRepairPrompt(service, entries, result.latest!);
        expect(prompt.length).toBeLessThan(35000);
        expect(prompt).toContain('ERROR: missing import');
        expect(prompt).toContain('退出码 1');
        expect(prompt).toContain('截断');
    });
});
