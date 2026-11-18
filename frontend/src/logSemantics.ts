export type Severity = 'error' | 'warn' | 'success' | 'info' | 'debug' | 'neutral';

export const errorPattern = /\b(?:error|failed|failure|fatal|panic|Traceback|Exception|ETIMEDOUT|CONNECT_TIMEOUT|ECONNREFUSED|EADDRINUSE|[A-Za-z]+Error|TS\d{4})\b|失败|异常退出|错误|致命/i;
export const warningPattern = /\b(?:warn|warning|deprecated|retry|timeout)\b|警告/i;
export const successPattern = /\b(?:ready|started|success|successful|successfully|succeeded|passed|passing|listening|ok|done|completed)\b|成功|通过|构建并导出完成|npm 脚本已完成/i;
const infoPattern = /\b(?:starting|stopping|stopped|synchronizing|rerunning|restarting)\b/i;

export function inferSeverity(message: string, stream: string): Severity {
    // Test summaries often contain zero failures alongside successful results.
    const signal = message.replace(/\b0\s+(?:errors?|failed|failures?|warnings?)\b|\b(?:errors?|failed|failures?|warnings?)\s*:\s*0\b/gi, '');
    if (errorPattern.test(signal)) return 'error';
    if (warningPattern.test(signal)) return 'warn';
    if (successPattern.test(signal)) return 'success';
    if (stream === 'system' || infoPattern.test(signal)) return 'info';
    return 'neutral';
}
