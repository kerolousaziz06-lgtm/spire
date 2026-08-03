// ============================================================
// PresetBar.tsx — saved companies, in the Vantage header.
//
// The control states what it knows: whether what is on screen IS a saved
// company, or an edited version of one, or something unsaved. That
// distinction is the whole reason for the feature, since loading a preset
// overwrites whatever is currently in the sidebar.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import {
  NAME_MAX, MAX_PRESETS, findByName, findMatching, savedAgo,
  type CompanyPreset,
} from '../lib/presets';
import type { CompanyInput } from '../lib/analysis';
import './PresetBar.css';

type Props = {
  presets: CompanyPreset[];
  input: CompanyInput;
  onLoad: (p: CompanyPreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
};

export function PresetBar({ presets, input, onLoad, onSave, onDelete, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // Exactly matches a saved company, or null. This is what lets the
  // button distinguish "Apple FY24" from "Apple FY24, edited".
  const active = findMatching(presets, input);
  const nameTaken = name.trim() ? findByName(presets, name) : null;
  const full = presets.length >= MAX_PRESETS;

  // Close on outside click and on Escape, like any menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function submitSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name);
    setName('');
  }

  return (
    <div className="pb" ref={wrapRef}>
      <button
        className={`pb-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="pb-trigger-label">Company presets</span>
        <span className="pb-trigger-state">
          {active ? active.name : presets.length ? 'unsaved' : 'none saved'}
        </span>
      </button>

      {open && (
        <div className="pb-panel" role="dialog" aria-label="Saved companies">
          <form className="pb-save" onSubmit={submitSave}>
            <input
              className="pb-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              placeholder={active ? `${active.name} (loaded)` : 'Name this company…'}
              aria-label="Preset name"
            />
            <button className="pb-btn pb-btn--primary" type="submit" disabled={!name.trim() || (full && !nameTaken)}>
              {nameTaken ? 'Update' : 'Save'}
            </button>
          </form>

          {/* Say why the button is disabled rather than leaving it dead. */}
          {full && !nameTaken && (
            <p className="pb-note">
              {MAX_PRESETS} saved, which is the limit. Delete one, or reuse a name to overwrite it.
            </p>
          )}
          {nameTaken && (
            <p className="pb-note">Overwrites “{nameTaken.name}”, saved {savedAgo(nameTaken.savedAt)}.</p>
          )}

          {presets.length === 0 ? (
            <p className="pb-empty">
              No saved companies yet. Enter a company in the sidebar, name it above, and it will be here to come
              back to.
            </p>
          ) : (
            <ul className="pb-list">
              {presets.map((p) => {
                const isActive = active?.id === p.id;
                return (
                  <li key={p.id} className={`pb-item ${isActive ? 'is-active' : ''}`}>
                    {renaming === p.id ? (
                      <form
                        className="pb-rename"
                        onSubmit={(e) => { e.preventDefault(); onRename(p.id, renameText); setRenaming(null); }}
                      >
                        <input
                          className="pb-input" autoFocus value={renameText} maxLength={NAME_MAX}
                          onChange={(e) => setRenameText(e.target.value)}
                          aria-label={`Rename ${p.name}`}
                        />
                        <button className="pb-btn" type="submit">Save</button>
                        <button className="pb-btn" type="button" onClick={() => setRenaming(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button className="pb-load" onClick={() => { onLoad(p); setOpen(false); }}>
                          <span className="pb-name">{p.name}</span>
                          <span className="pb-meta tabular">
                            {isActive ? 'loaded' : savedAgo(p.savedAt)}
                          </span>
                        </button>
                        <div className="pb-actions">
                          <button
                            className="pb-icon"
                            onClick={() => { setRenaming(p.id); setRenameText(p.name); }}
                            aria-label={`Rename ${p.name}`}
                          >rename</button>
                          {confirmingDelete === p.id ? (
                            <button
                              className="pb-icon pb-icon--danger"
                              onClick={() => { onDelete(p.id); setConfirmingDelete(null); }}
                              aria-label={`Confirm delete ${p.name}`}
                            >sure?</button>
                          ) : (
                            <button
                              className="pb-icon"
                              onClick={() => setConfirmingDelete(p.id)}
                              aria-label={`Delete ${p.name}`}
                            >delete</button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="pb-foot">
            Saved in this browser only. Loading a company replaces what is in the sidebar.
          </p>
        </div>
      )}
    </div>
  );
}
