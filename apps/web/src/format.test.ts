import { describe, expect, it } from 'vitest';
import { formatCount } from './format.ts';

describe('formatCount', () => {
  it('uses the singular for 1', () => {
    expect(formatCount(1, 'campaign')).toBe('1 CAMPAIGN');
  });
  it('uses the plural for 0 and many', () => {
    expect(formatCount(0, 'campaign')).toBe('0 CAMPAIGNS');
    expect(formatCount(3, 'campaign')).toBe('3 CAMPAIGNS');
  });
  it('accepts an irregular plural', () => {
    expect(formatCount(2, 'change', 'changes')).toBe('2 CHANGES');
  });
});
