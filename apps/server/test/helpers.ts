import type { CampaignInput } from '@launchdeck/shared';
import { buildApp } from '../src/app.ts';

export const validInput: CampaignInput = {
  name: 'Fall launch',
  owner: 'jdoe',
  startDate: '2026-10-01',
  launchDate: '2026-10-20',
  status: 'planned',
  folders: ['/content/dam/brand/fall-launch', '/content/dam/brand/assets'],
};

export function testApp() {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 8, 30, 12, 0, tick++)).toISOString();
  return buildApp({ dbPath: ':memory:', now });
}
