import {OpenServiceInVSCode} from '../../wailsjs/go/main/App';
import type {ServiceView} from '../types';
import {errorMessage} from '../utils';

export function useProjectOpeners(showToast: (message: string, kind?: 'success' | 'error') => void) {
    const openInVSCode = async (service: ServiceView) => {
        try {
            await OpenServiceInVSCode(service.id);
            showToast(`已在 VS Code 中打开 ${service.name}`);
        } catch (error) {
            showToast(errorMessage(error), 'error');
        }
    };

    return {openInVSCode};
}
