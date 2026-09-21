import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pluginRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const SKIP_DIRS = new Set(['node_modules', '.git']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot']);

export function walkPluginFiles(root = pluginRoot) {
  const files = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else files.push(p);
    }
  };
  visit(root);
  return files;
}

export function isBinaryPluginFile(path) {
  return BINARY_EXT.has(extname(path).toLowerCase());
}

export function fixture(rel) {
  return join(pluginRoot, rel);
}

export function withEnv(map, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(map)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

export function withAgentEnv(fn) {
  return withEnv({
    LESUTO_API_URL: undefined,
    LESUTO_AGENT_KEY: 'lsk_test_secretvalue',
    LESUTO_CHANNEL_TOKEN: 'merchant_demo_admin',
  }, fn);
}

export function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (body === undefined) throw new Error('not json');
      return body;
    },
  };
}

export async function withMockFetch(impl, fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const entry = { url: String(url), init };
    calls.push(entry);
    return impl(url, init, entry);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}
