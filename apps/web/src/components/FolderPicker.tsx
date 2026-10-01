import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { damFolderPath } from '@launchdeck/shared';
import type { FolderListing } from '@launchdeck/shared';
import { api } from '../api.ts';
import { DAM_ROOT, folderCrumbs } from '../campaignForm.ts';
import { errorText } from '../feed.ts';
import { formatCount } from '../format.ts';

export interface FolderPickerProps {
  /** id for the manual path input, so the form can focus it and label the field. */
  inputId: string;
  folders: string[];
  onChange: (folders: string[]) => void;
  /** id of the form-level folders error, when present. */
  errorId?: string;
  disabled?: boolean;
}

type Listing = { path: string; data: FolderListing; error?: never } | { path: string; error: string; data?: never };

export function FolderPicker({ inputId, folders, onChange, errorId, disabled = false }: FolderPickerProps) {
  const [browsing, setBrowsing] = useState(false);
  const [browsePath, setBrowsePath] = useState(DAM_ROOT);
  const [listing, setListing] = useState<Listing | null>(null);
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const manualErrorId = useId();
  const panelLabelId = useId();

  useEffect(() => {
    if (!browsing) return;
    const ac = new AbortController();
    api.listFolder(browsePath, ac.signal).then(
      (data) => setListing({ path: browsePath, data }),
      (err: unknown) => {
        if (!ac.signal.aborted) setListing({ path: browsePath, error: errorText(err) });
      },
    );
    return () => ac.abort();
  }, [browsing, browsePath]);

  const current = listing?.path === browsePath ? listing : null;
  const alreadyAdded = folders.includes(browsePath);
  const canUse = browsePath !== DAM_ROOT && !alreadyAdded && current?.data !== undefined;

  const add = (path: string) => onChange([...folders, path]);
  const remove = (path: string) => onChange(folders.filter((f) => f !== path));

  const openBrowser = () => {
    setBrowsePath(DAM_ROOT);
    setBrowsing(true);
    requestAnimationFrame(() => panel.current?.focus());
  };
  const closeBrowser = () => {
    setBrowsing(false);
    requestAnimationFrame(() => addButton.current?.focus());
  };
  const chooseFolder = () => {
    add(browsePath);
    closeBrowser();
  };
  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeBrowser();
  };

  const addManual = () => {
    const parsed = damFolderPath.safeParse(manual);
    if (!parsed.success) {
      setManualError(parsed.error.issues[0]?.message ?? 'Enter a folder path.');
      return;
    }
    if (folders.includes(parsed.data)) {
      setManualError(`${parsed.data} is already in the list.`);
      return;
    }
    add(parsed.data);
    setManual('');
    setManualError(null);
  };

  const describedBy = [manualError ? manualErrorId : null, errorId].filter(Boolean).join(' ') || undefined;
  const useHint = browsePath === DAM_ROOT ? 'Open a folder inside /content/dam to use it.' : alreadyAdded ? 'Already added.' : null;

  return (
    <div className="picker">
      {folders.length === 0 ? (
        <p className="body-s muted picker__empty">No folders yet.</p>
      ) : (
        <ul className="picker__list">
          {folders.map((path) => (
            <li key={path} className="picker__row">
              <span className="mono picker__path">{path}</span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => remove(path)}
                disabled={disabled}
                aria-label={`Remove ${path}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {browsing ? (
        <div
          ref={panel}
          className="picker__browser"
          role="group"
          aria-labelledby={panelLabelId}
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
        >
          <span id={panelLabelId} className="label">
            Browse DAM
          </span>
          <nav aria-label="Folder path">
            <ol className="picker__crumbs">
              {folderCrumbs(browsePath).map((crumb, i, all) => (
                <li key={crumb.path}>
                  {i === all.length - 1 ? (
                    <span className="mono picker__crumb picker__crumb--current" aria-current="location">
                      {crumb.label}
                    </span>
                  ) : (
                    <button type="button" className="mono picker__crumb" onClick={() => setBrowsePath(crumb.path)}>
                      {crumb.label}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div className="picker__body" aria-live="polite" aria-busy={current === null}>
            {current === null ? (
              <p className="body-s muted">Loading {browsePath}…</p>
            ) : current.error !== undefined ? (
              <p className="body-s status-error">
                Can't list {browsePath}: {current.error}
              </p>
            ) : (
              <>
                <p className="label picker__count">
                  {formatCount(current.data.assets.length, 'asset')} · {formatCount(current.data.folders.length, 'subfolder')}
                </p>
                {current.data.folders.length === 0 ? (
                  <p className="body-s muted">No subfolders.</p>
                ) : (
                  <ul className="picker__children">
                    {current.data.folders.map((f) => (
                      <li key={f.path}>
                        <button type="button" className="picker__child" onClick={() => setBrowsePath(f.path)}>
                          {f.title && f.title !== f.name && <span className="picker__child-title">{f.title}</span>}
                          <span className="mono picker__child-name">{f.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="picker__actions">
            <button type="button" className="btn btn--secondary btn--s" onClick={chooseFolder} disabled={!canUse || disabled}>
              Use this folder
            </button>
            <button type="button" className="btn btn--ghost" onClick={closeBrowser}>
              Cancel
            </button>
            {useHint && <span className="body-s muted">{useHint}</span>}
          </div>
        </div>
      ) : (
        <button
          ref={addButton}
          type="button"
          className="btn btn--secondary btn--s picker__add"
          onClick={openBrowser}
          disabled={disabled}
        >
          Add folder
        </button>
      )}

      <div className="picker__manual">
        <label className="label" htmlFor={inputId}>
          Or enter a path
        </label>
        <div className="picker__manual-row">
          <input
            id={inputId}
            className="input mono"
            type="text"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="/content/dam/…"
            value={manual}
            disabled={disabled}
            aria-invalid={manualError || errorId ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              setManual(e.target.value);
              if (manualError) setManualError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addManual();
              }
            }}
          />
          <button type="button" className="btn btn--secondary btn--s" onClick={addManual} disabled={disabled || !manual.trim()}>
            Add
          </button>
        </div>
        {manualError && (
          <p id={manualErrorId} className="field__error">
            {manualError}
          </p>
        )}
      </div>
    </div>
  );
}
