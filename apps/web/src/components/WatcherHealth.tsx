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
  /** Folders bound to the selected campaign; their rows are marked current. */
  selectedFolders: ReadonlySet<string>;
  /** Selects the campaign that owns the folder. */
  onSelectFolder: (folderPath: string) => void;
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

interface FolderRowProps {
  folder: FolderHealth;
  now: number;
  current: boolean;
  onSelect: () => void;
}

function FolderRow({ folder, now, current, onSelect }: FolderRowProps) {
  const status = folderRowStatus(folder, now);
  const error = status.kind === 'error';
  return (
    <li>
      <button type="button" className="health__folder" aria-current={current ? 'true' : undefined} onClick={onSelect}>
        <span className="track health__row">
          <span className="label health__label" title={folder.folderPath}>
            {folderLabel(folder.folderPath)}
          </span>
          <span className="track__rule" />
          <span
            className={`track__value health__value${error ? ' status-error' : ''}`}
            title={status.at ? `${formatLocalDateTime(status.at)} (${status.at})` : undefined}
          >
            {status.value}
          </span>
        </span>
        <span className="health__meta">
          <span className="mono muted health__path" title={folder.folderPath}>
            {folder.folderPath}
          </span>
          {folder.assetCount !== null && (
            <span className="mono health__count">{formatCount(folder.assetCount, 'asset')}</span>
          )}
        </span>
        {folder.auditReadable === false && (
          <span className="health__flags">
            <span
              className="pill pill--info pill--outline"
              title="Audit log unreadable; users come from jcr:lastModifiedBy"
            >
              JCR FALLBACK
            </span>
          </span>
        )}
        {error && folder.lastError && <span className="body-s status-error health__error">{folder.lastError}</span>}
      </button>
    </li>
  );
}

export function WatcherHealth({ health, stream, onPollNow, selectedFolders, onSelectFolder }: WatcherHealthProps) {
  const now = useNow();

  return (
    <div className="health">
      <div className="track">
        <span className="label" id="watcher-label">
          WATCHER
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
            <span className="health__fact">
              Every <span className="mono">{health.intervalSec} s</span>
            </span>{' '}
            ·{' '}
            <span className="health__fact">
              last tick <Time iso={health.lastTickAt}>{formatRelative(health.lastTickAt, now)}</Time>
            </span>{' '}
            ·{' '}
            <span className="health__fact">
              next <Time iso={health.nextTickAt}>{formatLocalDateTime(health.nextTickAt, clock)}</Time>
            </span>
          </p>
          {health.folders.length === 0 ? (
            <p className="body-s muted">No folders watched yet.</p>
          ) : (
            <ol className="health__folders" aria-label="Watched folders. Select one to open its campaign.">
              {health.folders.map((f) => (
                <FolderRow
                  key={f.folderPath}
                  folder={f}
                  now={now}
                  current={selectedFolders.has(f.folderPath)}
                  onSelect={() => onSelectFolder(f.folderPath)}
                />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
