'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

interface ComboBoxProps {
  id: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  customLabel?: string;
}

/**
 * Searchable dropdown with optional "Add new" support.
 * Keyboard: ↑ ↓ to navigate, Enter to select, Escape to close.
 */
export default function ComboBox({
  id, options, value, onChange, placeholder = 'Select…',
  allowCustom = true, customLabel = 'Add',
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter options
  const q = search.toLowerCase().trim();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const showAddNew = allowCustom && q && !options.some((o) => o.toLowerCase() === q);
  const totalItems = filtered.length + (showAddNew ? 1 : 0);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlight >= 0 && listRef.current) {
      const el = listRef.current.children[highlight] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight]);

  const pick = useCallback((val: string) => {
    onChange(val);
    setSearch('');
    setOpen(false);
    setHighlight(-1);
  }, [onChange]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, totalItems - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      if (highlight < filtered.length) pick(filtered[highlight]);
      else if (showAddNew) pick(search.trim());
    }
  };

  return (
    <div className="combobox" ref={wrapRef} id={id}>
      <div
        className={`combobox-trigger${open ? ' focus' : ''}`}
        onClick={() => { setOpen(!open); inputRef.current?.focus(); }}
      >
        {open ? (
          <input
            ref={inputRef}
            className="combobox-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlight(0); }}
            onKeyDown={handleKey}
            placeholder={value || placeholder}
            autoFocus
          />
        ) : (
          <span className={value ? 'combobox-val' : 'combobox-placeholder'}>
            {value || placeholder}
          </span>
        )}
        <svg className={`combobox-chevron${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div className="combobox-dropdown" ref={listRef}>
          {filtered.length === 0 && !showAddNew && (
            <div className="combobox-empty">No matches found</div>
          )}
          {filtered.map((item, i) => (
            <div
              key={item}
              className={`combobox-option${item === value ? ' selected' : ''}${i === highlight ? ' highlighted' : ''}`}
              onClick={() => pick(item)}
              onMouseEnter={() => setHighlight(i)}
            >
              {item === value && <span className="combobox-check">✓</span>}
              {item}
            </div>
          ))}
          {showAddNew && (
            <div
              className={`combobox-option combobox-add${highlight === filtered.length ? ' highlighted' : ''}`}
              onClick={() => pick(search.trim())}
              onMouseEnter={() => setHighlight(filtered.length)}
            >
              <span className="combobox-plus">+</span> {customLabel} "<strong>{search.trim()}</strong>"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
