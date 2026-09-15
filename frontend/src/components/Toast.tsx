import {CircleAlert} from 'lucide-react';
import type {ToastState} from '../types';

export default function Toast({toast}: {toast: ToastState}) {
    return <div className={`toast ${toast.kind}`} role="status">{toast.kind === 'error' ? <CircleAlert size={17}/> : <span className="toast-dot"/>}<span>{toast.message}</span></div>;
}
