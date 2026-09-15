import {useEffect, useRef} from 'react';

export default function SelectionCheckbox({checked, indeterminate, disabled, onChange, ariaLabel}: {
    checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void; ariaLabel: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate; }, [indeterminate]);
    return <input ref={inputRef} className="selection-checkbox" type="checkbox" checked={checked} disabled={disabled}
        onChange={onChange} aria-label={ariaLabel}/>;
}
