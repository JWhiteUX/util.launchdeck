import { useEffect, useId, useRef, useState } from 'react';
import type { CampaignView, ChangeEvent, EventFacets } from '@launchdeck/shared';
import { api } from '../api.ts';
import {
  NO_FILTERS,
  countNewEvents,
  errorText,
  filtersToQuery,
  hasFilters,
  isUnreviewed,
  newChangesMessage,
  relativeAssetPath,
  typePillClass,
} from '../feed.ts';
import type { FeedFilters } from '../feed.ts';
import { formatLocalDateTime } from '../time.ts';

export interface ActivityFeedProps {
  campaign: CampaignView;
  changeTick: number;
}

interface FeedResult {
  /** Identifies campaign + filters; a tick refetch keeps the same scope. */
  scope: string;
  tick: number;
  filters: FeedFilters;
  events?: ChangeEvent[];
  error?: string;
}

const scopeOf = (id: string, f: FeedFilters) => JSON.stringify([id, f.user, f.format]);

/** Keep a selected value listed even if the facets no longer include it. */
const withSelected = (values: string[], selected: string) =>
  selected && !values.includes(selected) ? [selected, ...values] : values;

export function ActivityFeed({ campaign, changeTick }: ActivityFeedProps) {
  const { id, reviewedAt } = campaign;
  const [filters, setFilters] = useState<FeedFilters>(NO_FILTERS);
  const [result, setResult] = useState<FeedResult | null>(null);
  const [facets, setFacets] = useState<EventFacets>({ users: [], formats: [] });
  const [announcement, setAnnouncement] = useState('');
  const lastEvents = useRef<{ scope: string; events: ChangeEvent[] } | null>(null);
  const userSelectId = useId();
  const formatSelectId = useId();

  const scope = scopeOf(id, filters);

  useEffect(() => {
    const ac = new AbortController();
    const requested = { scope: scopeOf(id, filters), tick: changeTick, filters };
    api.listEvents(id, filtersToQuery(filters), ac.signal).then(
      (events) => {
        const prev = lastEvents.current;
        if (prev && prev.scope === requested.scope) {
          const n = countNewEvents(prev.events, events);
          if (n > 0) {
            const msg = newChangesMessage(n);
            // A changed string is needed for screen readers to repeat the same count.
            setAnnouncement((a) => (a === msg ? `${msg}.` : msg));
          }
        }
        lastEvents.current = { scope: requested.scope, events };
        setResult({ ...requested, events });
      },
      (err: unknown) => {
        if (!ac.signal.aborted) setResult({ ...requested, error: errorText(err) });
      },
    );
    return () => ac.abort();
  }, [id, filters, changeTick]);

  useEffect(() => {
    const ac = new AbortController();
    api.eventFacets(id, ac.signal).then(setFacets, () => {
      // Filters fall back to the current selection; the feed itself reports fetch errors.
    });
    return () => ac.abort();
  }, [id, changeTick]);

  const sameScope = result?.scope === scope;
  const events = result?.events;
  const filtered = result ? hasFilters(result.filters) : false;

  let body;
  if (!result) {
    body = <p className="body-s muted">Loading activity…</p>;
  } else if (result.error !== undefined) {
    body = (
      <p className="body-s status-error" role="alert">
        Can't load activity: {result.error} Retrying when the watcher reports new changes.
      </p>
    );
  } else if (!events || events.length === 0) {
    body = (
      <p className="body-s muted">{filtered ? 'No changes match these filters.' : 'No changes detected yet.'}</p>
    );
  } else {
    body = (
      <div className="table-wrap feed__wrap">
        <table className="table feed__table">
          <caption className="visually-hidden">Asset changes for {campaign.name}, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Asset</th>
              <th scope="col">File type</th>
              <th scope="col">User</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const unreviewed = isUnreviewed(e, reviewedAt);
              return (
                <tr key={e.id} className={unreviewed ? 'feed__row feed__row--unreviewed' : 'feed__row'}>
                  <td className="feed__type">
                    {unreviewed && <span className="visually-hidden">Unreviewed. </span>}
                    <span className={typePillClass(e.type)}>{e.type}</span>
                  </td>
                  <td className="feed__asset">
                    <span className="feed__asset-name">{e.assetName}</span>
                    <span className="mono muted feed__asset-path" title={e.assetPath}>
                      {relativeAssetPath(e)}
                    </span>
                  </td>
                  <td className="mono feed__format">{e.format ?? '—'}</td>
                  <td className="feed__user">
                    {e.user ?? '—'}
                    {e.user && e.userSource === 'jcr' && (
                      <span className="mono muted feed__jcr" title="From jcr:lastModifiedBy (audit log unreadable)">
                        {' '}
                        JCR
                      </span>
                    )}
                  </td>
                  <td className="mono feed__when">
                    <time dateTime={e.occurredAt} title={e.occurredAt}>
                      {formatLocalDateTime(e.occurredAt)}
                    </time>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="feed" aria-busy={!sameScope}>
      <div className="feed__filters">
        <div className="field feed__filter">
          <label className="label" htmlFor={userSelectId}>
            User
          </label>
          <select
            id={userSelectId}
            className="select"
            value={filters.user}
            onChange={(e) => setFilters({ ...filters, user: e.target.value })}
          >
            <option value="">All users</option>
            {withSelected(facets.users, filters.user).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div className="field feed__filter">
          <label className="label" htmlFor={formatSelectId}>
            File type
          </label>
          <select
            id={formatSelectId}
            className="select mono"
            value={filters.format}
            onChange={(e) => setFilters({ ...filters, format: e.target.value })}
          >
            <option value="">All file types</option>
            {withSelected(facets.formats, filters.format).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {body}
    </div>
  );
}
