/** Matchers for the public Grok plugin packet. Strings that would leak if stored
 *  whole are assembled from fragments so this file itself stays clean. */

export const KEY_PLACEHOLDERS = new Set(['YOUR_KEY', 'YOUR', 'EXAMPLE', 'PLACEHOLDER', 'SAMPLE']);
export const TEST_KEY_PLACEHOLDERS = new Set(['secretvalue', 'x', 'fake', 'placeholder', 'example']);

export const ALLOWED_CHANNEL_TOKENS = new Set([
  'merchant_your-slug_admin',
  'merchant_demo_admin',
  'merchant_north_admin',
  'supplier_south_admin',
]);

export const FORBIDDEN_BASENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.staging',
  'credentials.json',
  'service-account.json',
  'id_rsa',
  'id_ed25519',
]);

export const FORBIDDEN_EXTENSIONS = new Set(['.pem', '.p12', '.pfx', '.key']);

export const PUBLIC_COPY_REL = [
  'README.md',
  'plugin.json',
  '.grok-plugin/plugin.json',
  'LICENSE',
];

export const PUBLIC_COPY_BANNED = [
  'SuperAdmin',
  'Vendure',
  'NestJS',
  'TypeORM',
  'Elasticsearch',
  'UpdateInternalPlatform',
  'ReadInternalPlatform',
  'internal-superadmin',
  'X-Lesuto-Agent-Key',
  'X-Crm-Agent-Token',
  'CRM_AGENT_TOKEN',
  'admin.lesuto.com',
  'staging-admin.lesuto.com',
  'Golden Template',
  'Cloud SQL',
];

export function houseSlugs() {
  return [
    ['lesuto', 'technologies', 'inc'].join('-'),
    'glen' + 'hymandesign',
    'buy' + 'homedesigns',
    'home' + 'stratosphere',
    'anderson' + '-teak',
    ['merchant', 'glen'].join('_'),
    ['supplier', 'ashcroft'].join('_'),
    ['merchant_', ['lesuto', 'technologies', 'inc'].join('-')].join(''),
  ];
}

const CHANNEL_TOKEN_RE = /\b(?:merchant|supplier)_[a-z0-9-]+_admin\b/g;
const LIVE_KEY_RE = /\blsk_live_([A-Za-z0-9]+)/g;
const TEST_KEY_RE = /\blsk_test_([A-Za-z0-9]+)/g;
const HEX_KEY_RE = /\blsk_(?:live|test)_([a-f0-9]{20,})\b/gi;
const OTHER_SECRET_RES = [
  /\bsk_(?:live|test)_[a-zA-Z0-9]{20,}\b/g,
  /\bpk_(?:live|test)_[a-zA-Z0-9]{20,}\b/g,
  /\bwhsec_[a-zA-Z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bghp_[a-zA-Z0-9]{36}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bglpat-[a-zA-Z0-9\-]{20,}\b/g,
  /\bxox[baprs]-[0-9]{8,}/g,
  /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  /^-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----$/gm,
];

function collect(re, text) {
  const copy = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...text.matchAll(copy)].map((m) => m[0]);
}

export function findCredentialLeaks(text) {
  const hits = [];
  for (const m of text.matchAll(LIVE_KEY_RE)) {
    if (!KEY_PLACEHOLDERS.has(m[1])) hits.push(m[0]);
  }
  for (const m of text.matchAll(TEST_KEY_RE)) {
    if (!TEST_KEY_PLACEHOLDERS.has(m[1])) hits.push(m[0]);
  }
  hits.push(...collect(HEX_KEY_RE, text));
  for (const re of OTHER_SECRET_RES) hits.push(...collect(re, text));
  return [...new Set(hits)];
}

export function findChannelTokenLeaks(text) {
  return [...new Set(collect(CHANNEL_TOKEN_RE, text).filter((tok) => !ALLOWED_CHANNEL_TOKENS.has(tok)))];
}

export function findHouseStoreLeaks(text) {
  const lower = text.toLowerCase();
  return houseSlugs().filter((slug) => lower.includes(slug.toLowerCase()));
}

export function findPublicCopyLeaks(text) {
  return PUBLIC_COPY_BANNED.filter((s) => text.includes(s));
}
