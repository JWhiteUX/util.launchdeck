/** Uppercase mono count label: formatCount(1, 'campaign') → "1 CAMPAIGN". */
export function formatCount(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${(n === 1 ? noun : plural).toUpperCase()}`;
}
