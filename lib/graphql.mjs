import { deniedOp, deniedSelectionField, extractFields } from './denied-ops.mjs';
import { getStickyStore } from './store-state.mjs';
import { resolveAgentKey, allAgentKeys, missingKeyMessage, describeAuthFailure } from './agent-key.mjs';

export const DEFAULT_API = 'https://api.lesuto.com';

const ALLOWED_API_HOSTS = new Set(['api.lesuto.com', 'staging-api.lesuto.com']);

export function redactSecrets(text) {
  let out = String(text || '');
  const channel = process.env.LESUTO_CHANNEL_TOKEN;
  for (const key of allAgentKeys()) out = out.split(key).join('[redacted]');
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

/**
 * Agent calls cost no credits (QA-347). Each store's plan has a monthly allowance (past it calls
 * are slowed, never refused) and a per-minute limit: past that the API answers 429 with
 * Retry-After, and the call is retried after that wait, up to RATE_LIMIT_RETRIES times.
 */
export const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 60_000;
/** Overridable in tests. */
export const retryTiming = { sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

function retryAfterMs(res) {
  const seconds = Number(res.headers?.get?.('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_WAIT_MS) : 5_000;
}

export async function adminGraphql(query, variables, opts = {}) {
  const resolved = resolveAgentKey();
  if (!resolved) {
    throw new Error(missingKeyMessage());
  }
  const { key, source } = resolved;
  const sticky = getStickyStore();
  const skipStore = opts.requireStore === false;
  const channel = sticky?.channelToken || process.env.LESUTO_CHANNEL_TOKEN || '';
  const storeHint = sticky?.alias || channel;
  if (!skipStore && !storeHint) {
    throw new Error('Set LESUTO_CHANNEL_TOKEN, or call list_stores then use_store.');
  }
  if (/\{\s*Scenes\b/i.test(query) && !/creativeScriptScenes/i.test(query)) {
    throw new Error("Operation 'Scenes' is not a Studio field. Use studio_scenes (query CreativeScriptScenes).");
  }
  for (const field of extractFields(query)) {
    if (deniedOp(field)) {
      throw new Error(`Operation '${field}' is not permitted for merchant Grok.`);
    }
  }
  const deniedSelection = deniedSelectionField(query);
  if (deniedSelection) {
    throw new Error(`Field '${deniedSelection}' is not permitted for merchant Grok.`);
  }
  const isMutation = /^\s*mutation\b/i.test(String(query || ''));
  if (isMutation && opts.allowWrite !== true) {
    throw new Error('lesuto_graphql is read-only. Use a named tool for writes.');
  }
  const url = `${apiBase()}/api/v3/admin/graphql`;
  const send = () => fetch(url, {
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
  let res;
  try {
    // A 429 means the call did not run (the store's per-minute limit): wait as told and try again.
    for (let attempt = 0; ; attempt++) {
      res = await send();
      if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break;
      await retryTiming.sleep(retryAfterMs(res));
    }
  } catch (err) {
    throw new Error(redactSecrets(err.message || 'Request failed'));
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
  if (res.status === 401 || res.status === 403) {
    const first = json?.errors?.[0];
    throw new Error(redactSecrets(describeAuthFailure({
      status: res.status,
      code: first?.extensions?.code,
      message: first?.message,
      source,
      key,
    })));
  }
  if (!res.ok) {
    throw new Error(redactSecrets(json?.errors?.[0]?.message || `HTTP ${res.status}`));
  }
  if (json.errors?.length) {
    throw new Error(redactSecrets(json.errors.map((e) => e.message).join('; ')));
  }
  return json.data;
}
