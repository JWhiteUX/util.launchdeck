import { badgeLabel } from '../badge.ts';
import type { BadgeFields } from '../badge.ts';

export interface StatusBadgeProps {
  campaign: BadgeFields;
}

export function StatusBadge({ campaign }: StatusBadgeProps) {
  const { label, tone, title } = badgeLabel(campaign);
  return (
    <span className={`pill pill--solid pill--${tone}`} title={title}>
      {label}
    </span>
  );
}
