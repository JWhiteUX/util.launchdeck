const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validates AEM_HOST and returns its base URL without a trailing slash.
 * https is required; plain http is allowed only for a local SDK. Errors never echo the value.
 */
export function parseAemHost(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('AEM_HOST must be a URL such as https://author-p123-e456.adobeaemcloud.com');
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('AEM_HOST must use https:// (http:// is allowed only for localhost)');
  }
  if (url.username || url.password) throw new Error('AEM_HOST must not contain credentials; use AEM_AUTH instead');
  if (url.search || url.hash) throw new Error('AEM_HOST must not contain a query string or fragment');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
