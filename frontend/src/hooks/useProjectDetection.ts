import {useEffect, useRef, useState} from 'react';
import {DetectProject} from '../../wailsjs/lal/app';
import type * as main from '../../wailsjs/lal/internal/launcher/models';
import {categoryOf, defaultCleanCommand} from '../types';
import type {ServiceForm} from '../types';
import {errorMessage} from '../utils';

export function useProjectDetection(initial: ServiceForm, editing: boolean) {
    const [form, setForm] = useState(initial);
    const [detection, setDetection] = useState<main.ProjectDetection | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [detectionError, setDetectionError] = useState('');
    const edited = useRef(new Set<keyof ServiceForm>());
    const request = useRef(0);
    const projectChanged = useRef(false);

    useEffect(() => {
        const directory = form.directory.trim();
        const version = ++request.current;
        setDetection(null);
        setDetectionError('');
        if (!directory || (editing && !projectChanged.current)) { setAnalyzing(false); return; }
        setAnalyzing(true);
        const timer = window.setTimeout(() => {
            DetectProject(directory).then(result => {
                if (request.current !== version) return;
                setDetection(result);
                setForm(current => {
                    const next = {...current};
                    for (const field of ['name', 'workspace', 'command', 'url', 'cleanCommand'] as const) {
                        if (!edited.current.has(field)) next[field] = result[field];
                    }
                    if (edited.current.has('command') && !edited.current.has('url')) {
                        next.url = result.scripts.find(script => script.command === next.command)?.url ?? '';
                    }
                    if (!edited.current.has('launchTargets')) next.launchTargets = result.launchTargets ?? [];
                    if (!edited.current.has('category')) next.category = categoryOf(result);
                    if (next.launchTargets?.length) next.category = 'monorepo';
                    if (!edited.current.has('releaseCommand')) next.releaseCommand = result.releaseCommand ?? '';
                    if (!edited.current.has('buildCommand')) next.buildCommand = result.buildCommand ?? '';
                    if (!edited.current.has('buildProfiles')) next.buildProfiles = result.buildProfiles ?? [];
                    if (!edited.current.has('buildBeforeLaunch')) next.buildBeforeLaunch = result.buildBeforeLaunch ?? Boolean(next.buildCommand);
                    if (!edited.current.has('launchMode')) next.launchMode = next.releaseCommand ? 'release' : 'debug';
                    return next;
                });
            }).catch(error => {
                if (request.current === version) setDetectionError(errorMessage(error));
            }).finally(() => {
                if (request.current === version) setAnalyzing(false);
            });
        }, 300);
        return () => { window.clearTimeout(timer); request.current++; };
    }, [form.directory, editing, initial.directory]);

    const change = <K extends keyof ServiceForm>(field: K, value: ServiceForm[K]) => {
        if (field === 'directory') {
            if (value === form.directory) return;
            projectChanged.current = true;
            request.current++;
            setDetection(null);
            setDetectionError('');
            setAnalyzing(Boolean(String(value).trim()));
        } else {
            edited.current.add(field);
        }
        setForm(current => {
            const next = {...current, [field]: value};
            if (field === 'directory') {
                for (const generated of ['name', 'workspace', 'command', 'url'] as const) {
                    if (!edited.current.has(generated)) next[generated] = '';
                }
                if (!edited.current.has('launchTargets')) next.launchTargets = [];
                if (!edited.current.has('category')) next.category = 'standalone';
                if (!edited.current.has('releaseCommand')) next.releaseCommand = '';
                if (!edited.current.has('buildCommand')) next.buildCommand = '';
                if (!edited.current.has('buildProfiles')) next.buildProfiles = [];
                if (!edited.current.has('buildBeforeLaunch')) next.buildBeforeLaunch = false;
                if (!edited.current.has('launchMode')) next.launchMode = 'debug';
                if (!edited.current.has('cleanCommand')) next.cleanCommand = defaultCleanCommand;
            }
            if (field === 'launchTargets' && next.launchTargets?.length) next.category = 'monorepo';
            if (field === 'buildCommand') {
                if (!String(value).trim()) next.buildBeforeLaunch = false;
                else if (!edited.current.has('buildBeforeLaunch')) next.buildBeforeLaunch = true;
            }
            if (field === 'command' && !edited.current.has('url')) {
                next.url = detection?.scripts.find(script => script.command === value)?.url ?? '';
            }
            return next;
        });
    };

    const chooseScript = (command: string) => {
        if (!command) { change('command', ''); return; }
        const script = detection?.scripts.find(item => item.command === command);
        if (!script) return;
        edited.current.delete('command');
        setForm(current => ({...current, command: script.command,
            url: edited.current.has('url') ? current.url : script.url}));
    };

    return {form, detection, analyzing, detectionError, change, chooseScript};
}
