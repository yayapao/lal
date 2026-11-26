import {render} from '@testing-library/react';
import {expect, it} from 'vitest';
import LogsPane from './components/LogsPane';
import {groupLogEntries} from './LogLine';
import {alphaService} from './testApi';
import type {LogEntry, ServiceView} from './types';

const noop = () => {};
const service = alphaService as ServiceView;
const entry = {serviceId: service.id, timestamp: '2026-11-19T15:10:00+08:00', stream: 'stdout', text: 'ready'} as LogEntry;

function pane(logs: LogEntry[], autoScroll = true, selectedService = service) {
    return <LogsPane selectedTargetId="" onSelectTarget={() => {}} service={selectedService} logs={logs} logBlocks={groupLogEntries(logs)} autoScroll={autoScroll}
        onToggleAutoScroll={noop} downloadingLogs={false} onDownloadLogs={noop} onClearLogs={noop}
        scriptBusy={false} onRunScript={noop} onStopScript={noop} history={[]} onOpenURL={noop} onOpenGit={noop}/>;
}

it('follows appended logs and project changes while preserving the position when follow is disabled', () => {
    const {container, rerender} = render(pane([entry]));
    const viewport = container.querySelector<HTMLDivElement>('.log-viewport')!;
    Object.defineProperty(viewport, 'scrollHeight', {get: () => 900});

    const appended = [entry, {...entry, text: 'build complete'}];
    rerender(pane(appended));
    expect(viewport.scrollTop).toBe(900);

    rerender(pane(appended, false));
    viewport.scrollTop = 80;
    const moreLogs = [...appended, {...entry, text: 'next build'}];
    rerender(pane(moreLogs, false));
    expect(viewport.scrollTop).toBe(80);

    rerender(pane(moreLogs));
    expect(viewport.scrollTop).toBe(900);

    viewport.scrollTop = 40;
    rerender(pane(moreLogs, true, {...service, id: 'beta'}));
    expect(viewport.scrollTop).toBe(900);
});
