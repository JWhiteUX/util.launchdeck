import { describe, expect, it } from 'vitest';
import { campaignInput } from './schemas.ts';

const valid = {
  name: 'Fall launch',
  owner: 'jdoe',
  startDate: '2026-10-01',
  launchDate: '2026-10-20',
  status: 'planned',
  folders: ['/content/dam/brand/fall-launch'],
};

describe('campaignInput', () => {
  it('accepts a valid campaign', () => {
    expect(campaignInput.safeParse(valid).success).toBe(true);
  });

  it('rejects launch before start', () => {
    const r = campaignInput.safeParse({ ...valid, launchDate: '2026-09-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['launchDate']);
  });

  it('rejects folders outside /content/dam', () => {
    expect(campaignInput.safeParse({ ...valid, folders: ['/content/site'] }).success).toBe(false);
    expect(campaignInput.safeParse({ ...valid, folders: ['/content/dam/a/'] }).success).toBe(false);
  });

  it('requires at least one unique folder', () => {
    expect(campaignInput.safeParse({ ...valid, folders: [] }).success).toBe(false);
    const dup = ['/content/dam/a', '/content/dam/a'];
    expect(campaignInput.safeParse({ ...valid, folders: dup }).success).toBe(false);
  });

  it('rejects malformed dates and unknown status', () => {
    expect(campaignInput.safeParse({ ...valid, startDate: '10/01/2026' }).success).toBe(false);
    expect(campaignInput.safeParse({ ...valid, status: 'done' }).success).toBe(false);
  });
});
