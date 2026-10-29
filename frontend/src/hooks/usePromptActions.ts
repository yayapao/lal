import {useCallback} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {
    ChooseAndAddPrompt,
    CopyCodexPrompt,
    GetPrompts,
    OpenCodexWithPrompt,
    RemovePromptFile,
} from '../../wailsjs/go/main/App';
import type {PromptFileView, RightView, ServiceView} from '../types';
import {errorMessage} from '../utils';

type PromptActionContext = {
    showToast: (message: string, kind?: 'success' | 'error') => void;
    setPrompts: Dispatch<SetStateAction<PromptFileView[]>>;
    setPromptLoading: Dispatch<SetStateAction<boolean>>;
    setPromptError: Dispatch<SetStateAction<string>>;
    setPromptSyncing: Dispatch<SetStateAction<boolean>>;
    setPromptBusy: Dispatch<SetStateAction<{path: string; action: 'copy' | 'open' | 'remove'} | null>>;
    setAddingPrompt: Dispatch<SetStateAction<boolean>>;
    setMenu: Dispatch<SetStateAction<{service: ServiceView; left: number; top: number} | null>>;
    setSelectedId: Dispatch<SetStateAction<string>>;
    setRightView: Dispatch<SetStateAction<RightView>>;
};

export function usePromptActions(context: PromptActionContext) {
    const {showToast, setPrompts, setPromptLoading, setPromptError,
        setPromptSyncing, setPromptBusy, setAddingPrompt, setMenu, setSelectedId, setRightView} = context;

    const loadPrompts = useCallback(async (serviceId: string) => {
        setPromptLoading(true);
        setPromptError('');
        try {
            setPrompts(await GetPrompts(serviceId) ?? []);
        } catch (error) {
            setPrompts([]);
            setPromptError(errorMessage(error));
        } finally {
            setPromptLoading(false);
        }
    }, [setPromptError, setPromptLoading, setPrompts]);

    const openPromptManager = (service: ServiceView) => {
        setMenu(null);
        setPrompts([]);
        setPromptError('');
        setPromptLoading(true);
        setSelectedId(service.id);
        setRightView('prompts');
    };

    const copyCodexPrompt = async (service: ServiceView, prompt: PromptFileView) => {
        setPromptBusy({path: prompt.path, action: 'copy'});
        try {
            await CopyCodexPrompt(service.id, prompt.path);
            showToast(`${prompt.name} 已复制`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptBusy(null);
        }
    };

    const openCodexWithPrompt = async (service: ServiceView, prompt: PromptFileView) => {
        setPromptBusy({path: prompt.path, action: 'open'});
        try {
            await OpenCodexWithPrompt(service.id, prompt.path);
            showToast(`已用 ${prompt.name} 打开 Codex`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptBusy(null);
        }
    };

    const addPrompt = async (service: ServiceView) => {
        setAddingPrompt(true);
        try {
            if (await ChooseAndAddPrompt(service.id)) {
                await loadPrompts(service.id);
                showToast('Prompt 已添加');
            }
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setAddingPrompt(false);
        }
    };

    const syncPrompts = async (service: ServiceView) => {
        setPromptSyncing(true);
        try {
            setPrompts(await GetPrompts(service.id) ?? []);
            setPromptError('');
            showToast('Prompt 已同步');
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptSyncing(false);
        }
    };

    const removePrompt = async (service: ServiceView, prompt: PromptFileView) => {
        setPromptBusy({path: prompt.path, action: 'remove'});
        try {
            await RemovePromptFile(service.id, prompt.path);
            await loadPrompts(service.id);
            showToast(`${prompt.name} 的关联已移除`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        } finally {
            setPromptBusy(null);
        }
    };

    return {loadPrompts, openPromptManager, copyCodexPrompt, openCodexWithPrompt, addPrompt, syncPrompts, removePrompt};
}
