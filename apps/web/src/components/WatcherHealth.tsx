import type { FolderHealth, WatcherHealth as Health } from '@launchdeck/shared';
import { STREAM_LABEL, folderLabel, folderRowStatus } from '../health.ts';
import { formatCount } from '../format.ts';
import type { StreamStatus } from '../sse.ts';
import { formatLocalDateTime, formatRelative } from '../time.ts';
import { useNow } from '../useNow.ts';
import '../styles/health.css';

export interface WatcherHealthProps {
  health: Health | null;
  stream: StreamStatus;
  onPollNow: () => void;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function Time({ iso, children }: { iso: string | null; children: string }) {
  return iso ? (
    <time className="mono" dateTime={iso} title={iso}>
      {children}
    </time>
  ) : (
    <span className="mono">{children}</span>
  );
}

function FolderRow({ folder, index, now }: { folder: FolderHealth; index: number; now: number }) {
  const status = folderRowStatus(folder, now);
  const error = status.kind === 'error';
  return (
    <li className="health__folder">
      <div className="track health__row">
        <span className="label health__label" title={folder.folderPath}>
          {String(index + 1).padStart(2, '0')} / {folderLabel(folder.folderPath)}
        </span>
        <span className="track__rule" />
        <span
          className={`track__value health__value${error ? ' status-error' : ''}`}
          title={status.at ? `${formatLocalDateTime(status.at)} (${status.at})` : undefined}
        >
          {status.value}
        </span>
      </div>
      <div className="health__meta">
        <span className="mono muted health__path">{folder.folderPath}</span>
        {folder.assetCount !== null && <span className="mono health__count">{formatCount(folder.assetCount, 'asset')}</span>}
        {folder.auditReadable === false && (
          <span className="pill pill--info pill--outline" title="Audit log unreadable; users come from jcr:lastModifiedBy">
            JCR FALLBACK
          </span>
        )}
      </div>
      {error && folder.lastError && <p className="body-s status-error health__error">{folder.lastError}</p>}
    </li>
  );
}

export function WatcherHealth({ health, stream, onPollNow }: WatcherHealthProps) {
  const now = useNow();

  return (
    <div className="health">
      <div className="track">
        <span className="label" id="watcher-label">
          03 / WATCHER
        </span>
        <span className="track__rule" />
        <span className="track__value">{STREAM_LABEL[stream]}</span>
        <button type="button" className="btn btn--ghost health__poll" onClick={onPollNow}>
          Poll now
        </button>
      </div>

      {!health ? (
        <p className="body-s muted">Waiting for the first watcher report.</p>
      ) : (
        <>
          <p className="body-s muted health__summary">
            Every <span className="mono">{health.intervalSec} s</span> · last tick{' '}
            <Time iso={health.lastTickAt}>{formatRelative(health.lastTickAt, now)}</Time> · next{' '}
            <Time iso={health.nextTickAt}>{formatLocalDateTime(health.nextTickAt, clock)}</Time>
          </p>
          {health.folders.length === 0 ? (
            <p className="body-s muted">No folders watched yet.</p>
          ) : (
            <ol className="health__folders">
              {health.folders.map((f, i) => (
                <FolderRow key={f.folderPath} folder={f} index={i} now={now} />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
