import type {ServiceView} from './types';
import {moduleOf} from './types';

export function isActive(service: ServiceView) {
    return service.status === 'running' || service.status === 'starting' || service.status === 'stopping';
}

export function projectNoun(service?: ServiceView | null) {
    return service && moduleOf(service) === 'game' ? '游戏' : '服务';
}

export function isStoppable(service: ServiceView) {
    return service.status === 'running' || service.status === 'starting';
}

export function serviceVisualState(service: ServiceView) {
    if (!service.pathExists) return 'invalid';
    if (service.status === 'running' && service.url && ['ready', 'checking', 'unreachable'].includes(service.health)) return service.health;
    if (!isActive(service) && service.port && !service.port.previewOnly) return service.port.matchesProject ? 'external' : 'conflict';
    return service.status;
}

export function formatUptime(startedAt: string) {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

export function formatCPU(value: number) {
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)}%`;
}

export function formatMemory(bytes: number) {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function cpuScale(values: number[]) {
    return Math.max(100, Math.ceil(Math.max(0, ...values) / 100) * 100);
}

export function memoryScale(values: number[]) {
    const step = 128 * 1024 ** 2;
    return Math.max(256 * 1024 ** 2, Math.ceil(Math.max(0, ...values) / step) * step);
}

export function displayURL(value: string) {
    return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function errorMessage(error: unknown) {
    if (typeof error === 'string') return error;
    if (error instanceof Error && error.message) return error.message;
    return '操作失败';
}
