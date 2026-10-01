import { campaignInput } from '@launchdeck/shared';
import type { CampaignInput, CampaignStatus, CampaignView } from '@launchdeck/shared';

export const DAM_ROOT = '/content/dam';

export interface CampaignForm {
  name: string;
  owner: string;
  startDate: string;
  launchDate: string;
  status: CampaignStatus;
  folders: string[];
}

export type FieldName = keyof CampaignForm;
export const FIELD_ORDER: readonly FieldName[] = ['name', 'owner', 'startDate', 'launchDate', 'status', 'folders'];

/** One message per field; `form` holds issues that don't map to a field. */
export type FieldErrors = Partial<Record<FieldName | 'form', string>>;

export interface Issue {
  path: readonly PropertyKey[];
  message: string;
}

export const STATUS_OPTIONS: readonly { value: CampaignStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'launched', label: 'Launched' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function statusLabel(status: CampaignStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function emptyForm(today: string): CampaignForm {
  return { name: '', owner: '', startDate: today, launchDate: today, status: 'planned', folders: [] };
}

export function formFromCampaign(c: CampaignView): CampaignForm {
  return {
    name: c.name,
    owner: c.owner,
    startDate: c.startDate,
    launchDate: c.launchDate,
    status: c.status,
    folders: [...c.folders],
  };
}

export function toInput(form: CampaignForm): CampaignInput {
  return {
    name: form.name.trim(),
    owner: form.owner.trim(),
    startDate: form.startDate,
    launchDate: form.launchDate,
    status: form.status,
    folders: form.folders.map((f) => f.trim()),
  };
}

const isField = (key: unknown): key is FieldName => typeof key === 'string' && FIELD_ORDER.includes(key as FieldName);

/** First message wins per field. `folders[1]` maps to `folders`. */
export function issuesToFieldErrors(issues: readonly Issue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = isField(issue.path[0]) ? issue.path[0] : 'form';
    errors[key] ??= issue.message;
  }
  return errors;
}

export type Validation = { ok: true; input: CampaignInput } | { ok: false; errors: FieldErrors };

export function validateForm(form: CampaignForm): Validation {
  const result = campaignInput.safeParse(toInput(form));
  return result.success ? { ok: true, input: result.data } : { ok: false, errors: issuesToFieldErrors(result.error.issues) };
}

export function firstInvalidField(errors: FieldErrors): FieldName | undefined {
  return FIELD_ORDER.find((f) => errors[f]);
}

export interface Crumb {
  label: string;
  path: string;
}

/** Breadcrumb for a DAM path: `/content/dam` is the root crumb, then one crumb per segment. */
export function folderCrumbs(path: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: DAM_ROOT, path: DAM_ROOT }];
  if (!path.startsWith(`${DAM_ROOT}/`)) return crumbs;
  let current = DAM_ROOT;
  for (const segment of path.slice(DAM_ROOT.length + 1).split('/')) {
    if (!segment) continue;
    current = `${current}/${segment}`;
    crumbs.push({ label: segment, path: current });
  }
  return crumbs;
}
