import { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { CampaignDetail } from './components/CampaignDetail.tsx';
import { CampaignModal } from './components/CampaignModal.tsx';
import type { ModalState } from './components/CampaignModal.tsx';
import { GanttView } from './components/GanttView.tsx';
import { WatcherHealth } from './components/WatcherHealth.tsx';
import { formatCount } from './format.ts';
import { campaignForFolder } from './health.ts';
import { useDashboard } from './store.ts';

const WATCHER_KEY = 'launchdeck.watcherOpen';

function loadWatcherOpen(): boolean {
  try {
    return localStorage.getItem(WATCHER_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** "Tray right": a frame with its right-hand panel marked. */
function TrayRightIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="1.5" y="2.5" width="13" height="11" stroke="currentColor" />
      <path d="M10.5 2.5v11" stroke="currentColor" />
      {open && <rect x="10.5" y="2.5" width="4" height="11" fill="currentColor" />}
    </svg>
  );
}

export function App() {
  const dash = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [watcherOpen, setWatcherOpen] = useState(loadWatcherOpen);
  const selected = dash.campaigns.find((c) => c.id === selectedId) ?? null;
  const selectedFolders = useMemo(() => new Set(selected?.folders ?? []), [selected]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHER_KEY, String(watcherOpen));
    } catch {
      // Storage unavailable (private window): the choice just isn't remembered.
    }
  }, [watcherOpen]);

  const selectFolder = (path: string) => {
    const id = campaignForFolder(dash.campaigns, path, selectedId);
    if (id) setSelectedId(id);
  };

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
        <div className="dashboard__top" data-watcher={watcherOpen ? 'open' : 'closed'}>
          <section className="dashboard__timeline" aria-labelledby="timeline-label">
            <div className="track">
              <span className="label" id="timeline-label">
                TIMELINE
              </span>
              <span className="track__rule" />
              <span className="track__value">{timelineValue}</span>
              <button
                type="button"
                className="btn btn--icon"
                aria-expanded={watcherOpen}
                aria-controls="watcher-panel"
                aria-label={watcherOpen ? 'Hide watcher' : 'Show watcher'}
                title={watcherOpen ? 'Hide watcher' : 'Show watcher'}
                onClick={() => setWatcherOpen((o) => !o)}
              >
                <TrayRightIcon open={watcherOpen} />
              </button>
            </div>
            {dash.error ? (
              <p className="body-s status-error" role="alert">
                Can't load campaigns: {dash.error} Check that the server is running on port 4000, then reload.
              </p>
            ) : !dash.loading && dash.campaigns.length === 0 ? (
              <div className="empty">
                <p className="body-s muted">No campaigns yet. Add one to start watching its DAM folders.</p>
                <button
                  type="button"
                  className="btn btn--secondary btn--s"
                  onClick={() => setModal({ mode: 'create' })}
                >
                  Add campaign
                </button>
              </div>
            ) : (
              <GanttView campaigns={dash.campaigns} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </section>

          <section
            className="dashboard__watcher"
            id="watcher-panel"
            aria-labelledby="watcher-label"
            hidden={!watcherOpen}
          >
            <WatcherHealth
              health={dash.health}
              stream={dash.stream}
              onPollNow={() => void api.pollNow()}
              selectedFolders={selectedFolders}
              onSelectFolder={selectFolder}
            />
          </section>
        </div>

        <section className="dashboard__detail" aria-labelledby="detail-label">
          <div className="track">
            <span className="label" id="detail-label">
              ACTIVITY
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
