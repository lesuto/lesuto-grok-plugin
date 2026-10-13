import { isGraphqlSchemaMismatch } from './scene-field-tiers.mjs';

const DEFAULT_HUB_ORIGIN = 'https://hub.lesuto.com';

export function stripHubPermalinkField(query) {
  return String(query || '').replace(/\bhubPermalink\b/g, '').replace(/[ \t]{2,}/g, ' ');
}

export function permalinkKindFromQuery(query) {
  return /\b(createScene|beginAsyncScenePublish)\b/.test(String(query || '')) ? 'scene' : 'post';
}

export function fallbackHubPermalink(id, kind) {
  const safe = encodeURIComponent(String(id ?? '').trim());
  if (!safe) return null;
  if (kind === 'scene') return `${DEFAULT_HUB_ORIGIN}/scenes?id=${safe}`;
  return `${DEFAULT_HUB_ORIGIN}/post/${safe}`;
}

export function attachFallbackHubPermalinks(data, kind) {
  if (!data || typeof data !== 'object') return data;
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 8) return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    const next = { ...node };
    if (next.id != null && (next.hubPermalink == null || next.hubPermalink === '')) {
      const url = fallbackHubPermalink(next.id, kind);
      if (url) next.hubPermalink = url;
    }
    for (const key of Object.keys(next)) {
      if (key === 'hubPermalink') continue;
      if (next[key] && typeof next[key] === 'object') {
        next[key] = walk(next[key], depth + 1);
      }
    }
    return next;
  };
  return walk(data, 0);
}

export async function graphqlWithHubPermalinkFallback(send, query, variables, opts) {
  try {
    return await send(query, variables, opts);
  } catch (err) {
    if (!isGraphqlSchemaMismatch(err) || !/\bhubPermalink\b/.test(String(query || ''))) {
      throw err;
    }
    const stripped = stripHubPermalinkField(query);
    const data = await send(stripped, variables, opts);
    return attachFallbackHubPermalinks(data, permalinkKindFromQuery(query));
  }
}
