import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, ReactNode, SyntheticEvent } from 'react';
import type { CampaignView } from '@launchdeck/shared';
import { ApiRequestError, api } from '../api.ts';
import {
  STATUS_OPTIONS,
  emptyForm,
  firstInvalidField,
  formFromCampaign,
  issuesToFieldErrors,
  validateForm,
} from '../campaignForm.ts';
import type { CampaignForm, FieldErrors, FieldName } from '../campaignForm.ts';
import { errorText } from '../feed.ts';
import { todayYmd } from '../time.ts';
import { FolderPicker } from './FolderPicker.tsx';
import '../styles/modal.css';

export type ModalState = { mode: 'create' } | { mode: 'edit'; campaign: CampaignView };

export interface CampaignModalProps {
  state: ModalState;
  onClose: () => void;
  onSaved: (campaign: CampaignView) => void;
  onDeleted: (id: string) => void;
}

type Busy = 'saving' | 'deleting' | null;

export function CampaignModal({ state, onClose, onSaved, onDeleted }: CampaignModalProps) {
  const editing = state.mode === 'edit' ? state.campaign : null;
  const [form, setForm] = useState<CampaignForm>(() => (editing ? formFromCampaign(editing) : emptyForm(todayYmd())));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const base = useId();
  const id = (field: FieldName) => `${base}-${field}`;
  const errorId = (field: FieldName) => `${base}-${field}-error`;
  const titleId = `${base}-title`;

  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const requestClose = () => {
    if (busy === null) onClose();
  };

  const onCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    requestClose();
  };

  const onBackdropPointerDown = (e: MouseEvent<HTMLDialogElement>) => {
    pressStartedOnBackdrop.current = e.target === e.currentTarget;
  };
  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && pressStartedOnBackdrop.current) requestClose();
    pressStartedOnBackdrop.current = false;
  };

  const update = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitted) {
      const result = validateForm(next);
      setErrors(result.ok ? {} : result.errors);
    }
  };

  const focusField = (field: FieldName | undefined) => {
    if (field) document.getElementById(id(field))?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setSubmitted(true);
    setFailure(null);
    const result = validateForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      focusField(firstInvalidField(result.errors));
      return;
    }
    setErrors({});
    setBusy('saving');
    try {
      const view = editing ? await api.updateCampaign(editing.id, result.input) : await api.createCampaign(result.input);
      onSaved(view);
    } catch (err) {
      setBusy(null);
      if (err instanceof ApiRequestError && err.status === 400 && err.issues?.length) {
        const fieldErrors = issuesToFieldErrors(err.issues);
        setErrors(fieldErrors);
        if (fieldErrors.form) setFailure(`Couldn't save: ${fieldErrors.form}`);
        focusField(firstInvalidField(fieldErrors));
      } else {
        setFailure(`Couldn't save: ${errorText(err)}`);
      }
    }
  };

  const startDelete = () => {
    setConfirmingDelete(true);
    setFailure(null);
    requestAnimationFrame(() => keepButton.current?.focus());
  };
  const keepCampaign = () => {
    setConfirmingDelete(false);
    requestAnimationFrame(() => deleteButton.current?.focus());
  };
  const confirmDelete = async () => {
    if (!editing || busy) return;
    setBusy('deleting');
    setFailure(null);
    try {
      await api.deleteCampaign(editing.id);
      onDeleted(editing.id);
    } catch (err) {
      setBusy(null);
      setFailure(`Couldn't delete: ${errorText(err)}`);
    }
  };

  const fieldProps = (field: FieldName) => ({
    id: id(field),
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? errorId(field) : undefined,
    disabled: busy !== null,
  });

  const errorLine = (field: FieldName): ReactNode =>
    errors[field] ? (
      <p id={errorId(field)} className="field__error">
        {errors[field]}
      </p>
    ) : null;

  return (
    // Backdrop clicks land on the <dialog> itself; Esc arrives as the native cancel event.
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onCancel={onCancel}
      onMouseDown={onBackdropPointerDown}
      onClick={onBackdropClick}
    >
      <form className="modal__surface" onSubmit={(e) => void onSubmit(e)} noValidate aria-busy={busy !== null}>
        <div className="track modal__header">
          <h2 className="label modal__title" id={titleId}>
            {editing ? 'Edit campaign' : 'New campaign'}
          </h2>
          <span className="track__rule" />
          {editing && <span className="track__value modal__subject">{editing.name.toUpperCase()}</span>}
        </div>

        <div className="modal__fields">
          <div className="field modal__span">
            <label className="label" htmlFor={id('name')}>
              Name
            </label>
            <input
              {...fieldProps('name')}
              className="input"
              type="text"
              autoComplete="off"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
            {errorLine('name')}
          </div>

          <div className="field modal__span">
            <label className="label" htmlFor={id('owner')}>
              Owner
            </label>
            <input
              {...fieldProps('owner')}
              className="input"
              type="text"
              autoComplete="off"
              value={form.owner}
              onChange={(e) => update('owner', e.target.value)}
            />
            {errorLine('owner')}
          </div>

          <div className="field">
            <label className="label" htmlFor={id('startDate')}>
              Start date
            </label>
            <input
              {...fieldProps('startDate')}
              className="input"
              type="date"
              value={form.startDate}
              onChange={(e) => update('startDate', e.target.value)}
            />
            {errorLine('startDate')}
          </div>

          <div className="field">
            <label className="label" htmlFor={id('launchDate')}>
              Launch date
            </label>
            <input
              {...fieldProps('launchDate')}
              className="input"
              type="date"
              value={form.launchDate}
              onChange={(e) => update('launchDate', e.target.value)}
            />
            {errorLine('launchDate')}
          </div>

          <div className="field modal__span">
            <label className="label" htmlFor={id('status')}>
              Status
            </label>
            <select
              {...fieldProps('status')}
              className="select"
              value={form.status}
              onChange={(e) => {
                const next = STATUS_OPTIONS.find((o) => o.value === e.target.value);
                if (next) update('status', next.value);
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {errorLine('status')}
          </div>

          <fieldset className="field modal__span modal__folders">
            <legend className="label">DAM folders</legend>
            <FolderPicker
              inputId={id('folders')}
              folders={form.folders}
              onChange={(folders) => update('folders', folders)}
              errorId={errors.folders ? errorId('folders') : undefined}
              disabled={busy !== null}
            />
            {errorLine('folders')}
          </fieldset>
        </div>

        {failure && (
          <p className="body-s status-error modal__failure" role="alert">
            {failure}
          </p>
        )}

        <div className="modal__footer">
          {confirmingDelete && editing ? (
            <>
              <p className="body-s modal__confirm-text">Delete {editing.name} and its change history?</p>
              <div className="modal__footer-actions">
                <button
                  ref={keepButton}
                  type="button"
                  className="btn btn--secondary"
                  onClick={keepCampaign}
                  disabled={busy !== null}
                >
                  Keep campaign
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void confirmDelete()}
                  disabled={busy !== null}
                >
                  {busy === 'deleting' ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </>
          ) : (
            <>
              {editing && (
                <button
                  ref={deleteButton}
                  type="button"
                  className="btn btn--danger modal__delete"
                  onClick={startDelete}
                  disabled={busy !== null}
                >
                  Delete campaign
                </button>
              )}
              <div className="modal__footer-actions">
                <button type="button" className="btn btn--secondary" onClick={requestClose} disabled={busy !== null}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={busy !== null}>
                  {busy === 'saving' ? 'Saving…' : 'Save campaign'}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
