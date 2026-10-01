import { describe, expect, it } from 'vitest';
import type { CampaignView } from '@launchdeck/shared';
import {
  emptyForm,
  firstInvalidField,
  folderCrumbs,
  formFromCampaign,
  issuesToFieldErrors,
  statusLabel,
  toInput,
  validateForm,
} from './campaignForm.ts';

const view: CampaignView = {
  id: 'c1',
  name: 'Fall launch',
  owner: 'jdoe',
  startDate: '2026-10-01',
  launchDate: '2026-10-20',
  status: 'in_progress',
  folders: ['/content/dam/fall'],
  reviewedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  badge: 'green',
  badgeReason: 'ok',
  unreviewedCount: 0,
};

describe('campaign form helpers', () => {
  it('builds an empty form dated today', () => {
    expect(emptyForm('2026-09-30')).toEqual({
      name: '',
      owner: '',
      startDate: '2026-09-30',
      launchDate: '2026-09-30',
      status: 'planned',
      folders: [],
    });
  });

  it('copies a campaign into a form without sharing the folders array', () => {
    const form = formFromCampaign(view);
    expect(form).toEqual({
      name: 'Fall launch',
      owner: 'jdoe',
      startDate: '2026-10-01',
      launchDate: '2026-10-20',
      status: 'in_progress',
      folders: ['/content/dam/fall'],
    });
    expect(form.folders).not.toBe(view.folders);
  });

  it('trims text fields and folders in the input', () => {
    const input = toInput({ ...emptyForm('2026-09-30'), name: '  Fall ', owner: ' jdoe', folders: [' /content/dam/a '] });
    expect(input).toMatchObject({ name: 'Fall', owner: 'jdoe', folders: ['/content/dam/a'] });
  });

  it('maps issues to one message per field, folders[n] to folders', () => {
    const errors = issuesToFieldErrors([
      { path: ['name'], message: 'Name is required' },
      { path: ['name'], message: 'second' },
      { path: ['folders', 1], message: 'Folder must be under /content/dam/ with no trailing slash' },
      { path: ['launchDate'], message: 'Launch date must be on or after start date' },
      { path: [], message: 'Bad body' },
      { path: ['unknown'], message: 'Ignored key' },
    ]);
    expect(errors).toEqual({
      name: 'Name is required',
      folders: 'Folder must be under /content/dam/ with no trailing slash',
      launchDate: 'Launch date must be on or after start date',
      form: 'Bad body',
    });
  });

  it('validates with the shared schema', () => {
    const bad = validateForm({ ...emptyForm('2026-10-05'), launchDate: '2026-10-01' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.name).toBe('Name is required');
      expect(bad.errors.owner).toBe('Owner is required');
      expect(bad.errors.folders).toBe('Add at least one DAM folder');
      expect(firstInvalidField(bad.errors)).toBe('name');
    }

    const dupes = validateForm({ ...formFromCampaign(view), folders: ['/content/dam/a', '/content/dam/a'] });
    expect(dupes.ok).toBe(false);
    if (!dupes.ok) expect(dupes.errors.folders).toBe('Folders must be unique');

    const good = validateForm(formFromCampaign(view));
    expect(good.ok).toBe(true);
  });

  it('labels statuses in sentence case', () => {
    expect(statusLabel('in_progress')).toBe('In progress');
    expect(statusLabel('cancelled')).toBe('Cancelled');
  });

  it('builds folder breadcrumbs from /content/dam', () => {
    expect(folderCrumbs('/content/dam')).toEqual([{ label: '/content/dam', path: '/content/dam' }]);
    expect(folderCrumbs('/content/dam/fall/hero')).toEqual([
      { label: '/content/dam', path: '/content/dam' },
      { label: 'fall', path: '/content/dam/fall' },
      { label: 'hero', path: '/content/dam/fall/hero' },
    ]);
    expect(folderCrumbs('/content/damage')).toHaveLength(1);
  });
});
