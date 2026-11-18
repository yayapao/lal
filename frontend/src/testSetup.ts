import {cleanup} from '@testing-library/react';
import {afterEach, beforeEach, vi} from 'vitest';
import {alphaService, api} from './testApi';

vi.mock('../wailsjs/lal/app', () => api);
vi.mock('@wailsio/runtime', async importOriginal => ({
    ...await importOriginal<typeof import('@wailsio/runtime')>(),
    Events: {On: vi.fn(() => () => undefined)},
}));

beforeEach(() => {
    vi.resetAllMocks();
    api.GetAppState.mockResolvedValue({services: [alphaService], workspaces: [], configPath: '/tmp/lal.json', warning: ''});
    api.GetLogs.mockResolvedValue([]);
    api.GetResourceUsage.mockResolvedValue([]);
    vi.stubGlobal('localStorage', {getItem: vi.fn(() => null), setItem: vi.fn()});
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
