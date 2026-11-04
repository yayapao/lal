import * as main from '../wailsjs/lal/internal/launcher/models';

export type ServiceView = main.ServiceView;
export type LogEntry = main.LogEntry;
export type ResourceUsage = main.ResourceUsage;
export type PromptFileView = main.PromptFileView;
export type GitStatus = main.GitStatus;
export type GitDetails = main.GitDetails;
export type NetworkInterface = main.NetworkInterface;
export type NetworkSnapshot = main.NetworkSnapshot;
export type AppModule = 'service' | 'game';
export type RightView = 'logs' | 'prompts' | 'git' | 'network';
export type BatchBusyState = 'all-start' | 'all-stop' | 'selected-start' | 'selected-stop' | null;
export type DialogState = {mode: 'create'; module: AppModule} | {mode: 'edit'; service: ServiceView};
export type ServiceForm = {name: string; workspace: string; directory: string; command: string; url: string; cleanCommand: string};
export type ToastState = {kind: 'success' | 'error'; message: string};
export type MenuState = {service: ServiceView; left: number; top: number};
export type OperationIssue = {title: string; message: string; actionLabel?: string; onAction?: () => Promise<void>};
export type WorkspaceGroup = {name: string; services: ServiceView[]};
export type WorkspaceDraft = {workspaces: string[]; assignments: Record<string, string>};

export const defaultCleanCommand = 'rm -rf .next';
export const ungroupedWorkspace = '未分组';
export const emptyForm: ServiceForm = {name: '', workspace: '', directory: '', command: 'npm run dev', url: '', cleanCommand: defaultCleanCommand};
export const resourceHistoryLength = 60;

export function moduleOf(service: ServiceView): AppModule {
    return service.module === 'game' ? 'game' : 'service';
}
