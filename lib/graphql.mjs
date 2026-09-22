import { deniedOp, extractFields } from './denied-ops.mjs';
import { getStickyStore } from './store-state.mjs';

export const DEFAULT_API = 'https://api.lesuto.com';

const ALLOWED_API_HOSTS = new Set(['api.lesuto.com', 'staging-api.lesuto.com']);

export function redactSecrets(text) {
  let out = String(text || '');
  const key = process.env.LESUTO_AGENT_KEY;
  const channel = process.env.LESUTO_CHANNEL_TOKEN;
  if (key) out = out.split(key).join('[redacted]');
  if (channel) out = out.split(channel).join('[redacted]');
  return out;
}

export function apiBase() {
  const raw = (process.env.LESUTO_API_URL || DEFAULT_API).trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('LESUTO_API_URL must be https://api.lesuto.com');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('LESUTO_API_URL must use https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('LESUTO_API_URL must not include credentials');
  }
  if (parsed.port) {
    throw new Error('LESUTO_API_URL must use the default https port');
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_API_HOSTS.has(host)) {
    throw new Error('LESUTO_API_URL must be https://api.lesuto.com');
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error('LESUTO_API_URL must be the API origin, with no path');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('LESUTO_API_URL must be the API origin, with no query');
  }
  return `https://${host}`;
}

export async function adminGraphql(query, variables, opts = {}) {
  const key = process.env.LESUTO_AGENT_KEY;
  if (!key) {
    throw new Error('Set LESUTO_AGENT_KEY (Command Center or Seller → AI Agent Access).');
  }
  const sticky = getStickyStore();
  const skipStore = opts.requireStore === false;
  const channel = sticky?.channelToken || process.env.LESUTO_CHANNEL_TOKEN || '';
  const storeHint = sticky?.alias || channel;
  if (!skipStore && !storeHint) {
    throw new Error('Set LESUTO_CHANNEL_TOKEN, or call list_stores then use_store.');
  }
  for (const field of extractFields(query)) {
    if (deniedOp(field)) {
      throw new Error(`Operation '${field}' is not permitted for merchant Grok.`);
    }
  }
  const isMutation = /^\s*mutation\b/i.test(String(query || ''));
  if (isMutation && opts.allowWrite !== true) {
    throw new Error('lesuto_graphql is read-only. Use a named tool for writes.');
  }
  const url = `${apiBase()}/api/v3/admin/graphql`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Lesuto-Agent-Key': key,
        'X-Lesuto-Client': 'grok',
        ...(channel && !skipStore ? { 'vendure-token': channel } : {}),
        ...(storeHint && !skipStore ? { 'X-Store': storeHint } : {}),
      },
      body: JSON.stringify({ query, variables: variables || {} }),
    });
  } catch (err) {
    throw new Error(redactSecrets(err.message || 'Request failed'));
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(redactSecrets(json?.errors?.[0]?.message || `HTTP ${res.status}`));
  }
  if (json.errors?.length) {
    throw new Error(redactSecrets(json.errors.map((e) => e.message).join('; ')));
  }
  return json.data;
}
