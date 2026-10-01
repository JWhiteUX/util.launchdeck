import { useState } from 'react';
import { api } from './api.ts';
import { CampaignDetail } from './components/CampaignDetail.tsx';
import { CampaignModal } from './components/CampaignModal.tsx';
import type { ModalState } from './components/CampaignModal.tsx';
import { GanttView } from './components/GanttView.tsx';
import { WatcherHealth } from './components/WatcherHealth.tsx';
import { formatCount } from './format.ts';
import { useDashboard } from './store.ts';

export function App() {
  const dash = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const selected = dash.campaigns.find((c) => c.id === selectedId) ?? null;

  const timelineValue = dash.loading ? 'LOADING' : dash.error ? 'ERROR' : formatCount(dash.campaigns.length, 'campaign');

  return (
    <>
      <header className="nav">
        <div className="nav__inner">
          <a className="wordmark" href="/" aria-label="Launchdeck home">
            <span className="wordmark__mark" aria-hidden="true" />
            <span className="wordmark__name">Launchdeck</span>
          </a>
          <div className="nav__actions">
            <button type="button" className="btn btn--primary btn--s" onClick={() => setModal({ mode: 'create' })}>
              New campaign
            </button>
          </div>
        </div>
      </header>

      <main className="page dashboard">
        <section className="dashboard__timeline" aria-labelledby="timeline-label">
          <div className="track">
            <span className="label" id="timeline-label">
              01 / TIMELINE
            </span>
            <span className="track__rule" />
            <span className="track__value">{timelineValue}</span>
          </div>
          {dash.error ? (
            <p className="body-s status-error" role="alert">
              Can't load campaigns: {dash.error} Check that the server is running on port 4000, then reload.
            </p>
          ) : !dash.loading && dash.campaigns.length === 0 ? (
            <div className="empty">
              <p className="body-s muted">No campaigns yet. Add one to start watching its DAM folders.</p>
              <button type="button" className="btn btn--secondary btn--s" onClick={() => setModal({ mode: 'create' })}>
                Add campaign
              </button>
            </div>
          ) : (
            <GanttView campaigns={dash.campaigns} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </section>

        <div className="dashboard__lower">
          <section className="dashboard__detail" aria-labelledby="detail-label">
            <div className="track">
              <span className="label" id="detail-label">
                02 / ACTIVITY
              </span>
              <span className="track__rule" />
              <span className="track__value">{selected ? selected.name.toUpperCase() : 'NONE SELECTED'}</span>
            </div>
            {selected ? (
              <CampaignDetail
                campaign={selected}
                changeTick={dash.changeTicks[selected.id] ?? 0}
                onEdit={() => setModal({ mode: 'edit', campaign: selected })}
                onReviewed={dash.upsert}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <p className="body-s muted">Select a campaign on the timeline to see its asset changes.</p>
            )}
          </section>

          <section className="dashboard__watcher" aria-labelledby="watcher-label">
            <WatcherHealth health={dash.health} stream={dash.stream} onPollNow={() => void api.pollNow()} />
          </section>
        </div>
      </main>

      {modal && (
        <CampaignModal
          state={modal}
          onClose={() => setModal(null)}
          onSaved={(campaign) => {
            dash.upsert(campaign);
            setSelectedId(campaign.id);
            setModal(null);
          }}
          onDeleted={(id) => {
            dash.remove(id);
            if (selectedId === id) setSelectedId(null);
            setModal(null);
          }}
        />
      )}
    </>
  );
}
