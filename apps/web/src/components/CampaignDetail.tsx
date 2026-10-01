import { useState } from 'react';
import type { CampaignView } from '@launchdeck/shared';
import { api } from '../api.ts';
import { statusLabel } from '../campaignForm.ts';
import { errorText } from '../feed.ts';
import { formatCalendarDate, formatLocalDateTime } from '../time.ts';
import { ActivityFeed } from './ActivityFeed.tsx';
import { StatusBadge } from './StatusBadge.tsx';
import '../styles/detail.css';

export interface CampaignDetailProps {
  campaign: CampaignView;
  /** Increments when new change events arrive for this campaign; refetch the feed when it changes. */
  changeTick: number;
  onEdit: () => void;
  onReviewed: (campaign: CampaignView) => void;
  onClose: () => void;
}

export function CampaignDetail({ campaign, changeTick, onEdit, onReviewed, onClose }: CampaignDetailProps) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const reviewing = reviewingId === campaign.id;
  const failureText = failure?.id === campaign.id ? failure.message : null;
  const nothingToReview = campaign.unreviewedCount === 0;

  const markReviewed = async () => {
    const id = campaign.id;
    setReviewingId(id);
    setFailure(null);
    try {
      onReviewed(await api.markReviewed(id));
    } catch (err) {
      setFailure({ id, message: `Couldn't mark reviewed: ${errorText(err)}` });
    } finally {
      setReviewingId((current) => (current === id ? null : current));
    }
  };

  return (
    <article className="detail" aria-labelledby={`detail-name-${campaign.id}`}>
      <header className="detail__header">
        <div className="detail__title-row">
          <h3 className="detail__name" id={`detail-name-${campaign.id}`}>
            {campaign.name}
          </h3>
          <StatusBadge campaign={campaign} />
        </div>

        <dl className="detail__specs">
          <div className="detail__spec">
            <dt className="label">Owner</dt>
            <dd>{campaign.owner}</dd>
          </div>
          <div className="detail__spec">
            <dt className="label">Status</dt>
            <dd>{statusLabel(campaign.status)}</dd>
          </div>
          <div className="detail__spec">
            <dt className="label">Start</dt>
            <dd className="mono">
              <time dateTime={campaign.startDate}>{formatCalendarDate(campaign.startDate)}</time>
            </dd>
          </div>
          <div className="detail__spec">
            <dt className="label">Launch</dt>
            <dd className="mono">
              <time dateTime={campaign.launchDate}>{formatCalendarDate(campaign.launchDate)}</time>
            </dd>
          </div>
          <div className="detail__spec">
            <dt className="label">Last review</dt>
            <dd className="mono" title={campaign.reviewedAt ?? undefined}>
              {campaign.reviewedAt ? formatLocalDateTime(campaign.reviewedAt) : 'Never'}
            </dd>
          </div>
          <div className="detail__spec detail__spec--wide">
            <dt className="label">Folders</dt>
            <dd>
              <ul className="detail__folders">
                {campaign.folders.map((f) => (
                  <li key={f} className="mono">
                    {f}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className="detail__actions">
          <button
            type="button"
            className="btn btn--s btn--secondary"
            onClick={() => void markReviewed()}
            disabled={reviewing || nothingToReview}
            title={nothingToReview ? 'No unreviewed changes' : undefined}
          >
            {reviewing ? 'Marking reviewed…' : 'Mark reviewed'}
          </button>
          <button type="button" className="btn btn--secondary btn--s" onClick={onEdit}>
            Edit campaign
          </button>
          <button type="button" className="btn btn--ghost detail__close" onClick={onClose}>
            Close
          </button>
        </div>
        {failureText && (
          <p className="body-s status-error" role="alert">
            {failureText}
          </p>
        )}
      </header>

      <ActivityFeed key={campaign.id} campaign={campaign} changeTick={changeTick} />
    </article>
  );
}
