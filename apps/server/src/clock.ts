export const isoNow = (): string => new Date().toISOString();

export const addSeconds = (iso: string, sec: number): string => new Date(Date.parse(iso) + sec * 1000).toISOString();
