import {useState} from 'react';
import {AlertCircle, Check, Copy, Download, LoaderCircle} from 'lucide-react';
import {CopyRepairPrompt, DownloadRepairPrompt} from '../../wailsjs/lal/app';
import {errorMessage} from '../utils';
import type {ServiceView} from '../types';

export default function BuildFailureActions({service, prompt}: {service: ServiceView; prompt: string}) {
    const [busy, setBusy] = useState<'copy' | 'download' | null>(null);
    const [message, setMessage] = useState('');
    const [copied, setCopied] = useState(false);
    const act = async (action: 'copy' | 'download') => {
        setBusy(action);
        setMessage('');
        try {
            if (action === 'copy') {
                await CopyRepairPrompt(prompt);
                setCopied(true);
                setMessage('已复制，粘贴给 Codex 或其他 agent 即可');
            } else {
                const path = await DownloadRepairPrompt(service.id, prompt);
                if (path) setMessage(`已导出到 ${path}`);
            }
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(null);
        }
    };
    return <div className="build-failure-actions">
        <div className="build-failure-title"><AlertCircle size={15}/><strong>构建 / 脚本失败</strong></div>
        <div className="build-failure-buttons">
            <button type="button" onClick={() => void act('copy')} disabled={busy !== null}>
                {busy === 'copy' ? <LoaderCircle className="spin" size={13}/> : copied ? <Check size={13}/> : <Copy size={13}/>}
                复制修复 Prompt
            </button>
            <button type="button" onClick={() => void act('download')} disabled={busy !== null}>
                {busy === 'download' ? <LoaderCircle className="spin" size={13}/> : <Download size={13}/>}
                导出 Prompt
            </button>
        </div>
        {message && <span className="build-failure-feedback" role="status">{message}</span>}
    </div>;
}
