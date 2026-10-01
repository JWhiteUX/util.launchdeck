/** Structured logger subset used by the live AEM client (pino / WatcherLog compatible). */
export interface AemLog {
  debug(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export const silentLog: AemLog = { debug: () => {}, warn: () => {} };
