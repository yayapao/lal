import {act, cleanup, renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {launcher as main} from '../../wailsjs/go/models';
import {alphaService, api} from '../testApi';
import {useGitStatuses} from './useGitStatuses';
import {useGitDetails} from './useGitDetails';

vi.mock('../../wailsjs/go/main/App', () => api);

const service = (directory = '/tmp/alpha') => main.ServiceView.createFrom({...alphaService, directory});
const status = (directory = '/tmp/alpha', state = 'clean') => main.GitStatus.createFrom({serviceId: 'alpha', directory, state, branch: 'main'});
const details = (directory: string) => main.GitDetails.createFrom({status: status(directory), files: [], config: []});

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('does not probe again for service runtime updates and ignores obsolete directory results', async () => {
    let resolveOld!: (statuses: main.GitStatus[]) => void;
    api.GetGitStatuses.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue([status('/tmp/new', 'dirty')]);
    const {result, rerender} = renderHook(({services}) => useGitStatuses(services), {initialProps: {services: [service()]}});

    rerender({services: [main.ServiceView.createFrom({...alphaService, status: 'running'})]});
    expect(api.GetGitStatuses).toHaveBeenCalledTimes(1);
    rerender({services: [service('/tmp/new')]});
    await waitFor(() => expect(result.current.statuses.alpha?.state).toBe('dirty'));
    await act(async () => resolveOld([status()]));
    expect(result.current.statuses.alpha.directory).toBe('/tmp/new');
});

it('refreshes periodically and on demand without overlapping probes', async () => {
    vi.useFakeTimers();
    let resolve!: (statuses: main.GitStatus[]) => void;
    api.GetGitStatuses.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue([status()]);
    const {result, rerender} = renderHook(({key}) => useGitStatuses([service()], key), {initialProps: {key: 0}});
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(api.GetGitStatuses).toHaveBeenCalledTimes(1);
    await act(async () => resolve([status()]));
    expect(result.current.statuses.alpha.state).toBe('clean');
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(api.GetGitStatuses).toHaveBeenCalledTimes(2);
    rerender({key: 1});
    await act(async () => undefined);
    expect(api.GetGitStatuses).toHaveBeenCalledTimes(3);
});

it('reports failed probes instead of claiming a clean workspace', async () => {
    api.GetGitStatuses.mockRejectedValue('Git 探测超时');
    const {result} = renderHook(() => useGitStatuses([service()]));
    await waitFor(() => expect(result.current.statuses.alpha?.state).toBe('error'));
    expect(result.current.statuses.alpha.error).toBe('Git 探测超时');
});

it('never displays old Git details after the project directory changes', async () => {
    let resolveOld!: (value: main.GitDetails) => void;
    const onStatus = vi.fn();
    api.GetServiceGitDetails.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(details('/tmp/new'));
    const {result, rerender} = renderHook(({project}) => useGitDetails(project, 0, onStatus), {initialProps: {project: service()}});
    rerender({project: service('/tmp/new')});
    await waitFor(() => expect(result.current.details?.status.directory).toBe('/tmp/new'));
    await act(async () => resolveOld(details('/tmp/alpha')));
    expect(result.current.details?.status.directory).toBe('/tmp/new');
    expect(onStatus).toHaveBeenCalledTimes(1);
});

it('pauses automatic detail refresh during editing and preserves data through toolbar refresh', async () => {
    vi.useFakeTimers();
    api.GetServiceGitDetails.mockResolvedValue(details('/tmp/alpha'));
    const onStatus = vi.fn();
    const {result, rerender} = renderHook(({paused, key}) => useGitDetails(service(), key, onStatus, paused), {initialProps: {paused: false, key: 0}});
    await act(async () => undefined);
    expect(result.current.details?.status.directory).toBe('/tmp/alpha');
    rerender({paused: true, key: 0});
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(1);
    rerender({paused: true, key: 1});
    expect(result.current.details?.status.directory).toBe('/tmp/alpha');
    expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refresh(); });
    expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(2);
});

it('rereads after saving even when an earlier automatic detail request is still pending', async () => {
    vi.useFakeTimers();
    let resolve!: (value: main.GitDetails) => void;
    const oldDetails = details('/tmp/alpha');
    const newDetails = main.GitDetails.createFrom({...oldDetails, config: [{key: 'user.name', value: 'new'}]});
    api.GetServiceGitDetails.mockResolvedValueOnce(oldDetails)
        .mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue(newDetails);
    const onStatus = vi.fn();
    const {result, rerender} = renderHook(({paused}) => useGitDetails(service(), 0, onStatus, paused), {initialProps: {paused: false}});
    await act(async () => undefined);
    await act(async () => { vi.advanceTimersByTime(15000); });
    rerender({paused: true});
    const refresh = result.current.refresh();
    await act(async () => { resolve(oldDetails); await refresh; });
    expect(api.GetServiceGitDetails).toHaveBeenCalledTimes(3);
    expect(result.current.details?.config[0].value).toBe('new');
});
