import {useState} from 'react';
import {SaveWorkspaceLayout} from '../../wailsjs/go/main/App';
import type {ServiceView, WorkspaceDraft} from '../types';
import {errorMessage} from '../utils';

export function useWorkspaceManager(services: ServiceView[], workspaces: string[], refresh: () => Promise<void>, showToast: (message: string) => void) {
    const [draft, setDraft] = useState<WorkspaceDraft | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const open = () => {
        setError('');
        setDraft({workspaces: [...workspaces], assignments: Object.fromEntries(services.map(service => [service.id, service.workspace ?? '']))});
    };
    const close = () => { if (!saving) setDraft(null); };
    const save = async () => {
        if (!draft || saving) return;
        setSaving(true); setError('');
        try {
            await SaveWorkspaceLayout(draft);
            setDraft(null);
            showToast('Workspace 已保存');
            await refresh();
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setSaving(false);
        }
    };
    return {draft, setDraft, saving, error, open, close, save};
}
