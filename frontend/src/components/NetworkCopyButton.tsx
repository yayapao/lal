import {Check, Copy} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {CopyNetworkValue} from '../../wailsjs/go/main/App';
import {errorMessage} from '../utils';

export default function NetworkCopyButton({value, label, onError}: {
    value: string; label: string; onError: (message: string) => void;
}) {
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const copy = async () => {
        setCopied(false);
        setBusy(true);
        try {
            await CopyNetworkValue(value);
            setCopied(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1800);
        } catch (error) { onError(`复制失败：${errorMessage(error)}`); }
        finally { setBusy(false); }
    };
    return <>
        <button className={`icon-button network-copy${copied ? ' is-copied' : ''}`} type="button" disabled={!value || busy}
            onClick={() => void copy()} aria-label={`复制${label}`} title={copied ? '已复制' : `复制${label}`}>
            {copied ? <Check size={15}/> : <Copy size={15}/>}
        </button>
        <span className="sr-only" role="status">{copied ? `${label}已复制` : ''}</span>
    </>;
}
