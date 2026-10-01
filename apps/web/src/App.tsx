import { useEffect, useState } from 'react';
import type { Campaign } from '@launchdeck/shared';
import { listCampaigns } from './api.ts';
import { formatCount } from './format.ts';

type CampaignsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; campaigns: Campaign[] };

function useCampaigns(): CampaignsState {
  const [state, setState] = useState<CampaignsState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    listCampaigns(controller.signal).then(
      (campaigns) => setState({ status: 'ready', campaigns }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => controller.abort();
  }, []);

  return state;
}

function trackValue(state: CampaignsState): string {
  switch (state.status) {
    case 'loading':
      return 'LOADING';
    case 'error':
      return 'ERROR';
    case 'ready':
      return formatCount(state.campaigns.length, 'campaign');
  }
}

export function App() {
  const campaigns = useCampaigns();

  return (
    <>
      <header className="nav">
        <div className="nav__inner">
          <a className="wordmark" href="/" aria-label="Launchdeck home">
            <span className="wordmark__mark" aria-hidden="true" />
            <span className="wordmark__name">Launchdeck</span>
          </a>
          <div className="nav__actions">
            <button type="button" className="btn btn--primary btn--s">
              New campaign
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <section aria-labelledby="timeline-label">
          <div className="track">
            <span className="label" id="timeline-label">
              01 / TIMELINE
            </span>
            <span className="track__rule" />
            <span className="track__value" aria-live="polite">
              {trackValue(campaigns)}
            </span>
          </div>
          {campaigns.status === 'error' ? (
            <p className="body-s status-error">
              Can't load campaigns: {campaigns.message} Check that the server is running on port 4000, then reload.
            </p>
          ) : (
            <p className="body-s muted">Timeline arrives in Phase 4.</p>
          )}
        </section>
      </main>
    </>
  );
}
