import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function withEnv(map, fn) {
  const prev = {};
  for (const key of Object.keys(map)) {
    prev[key] = process.env[key];
    const value = map[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const key of Object.keys(map)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
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

export const TEST_KEY = 'lsk_test_secretvalue';
export const TEST_TOKEN = 'merchant_demo_admin';

export function withAgentEnv(fn) {
  return withEnv(
    {
      LESUTO_AGENT_KEY: TEST_KEY,
      LESUTO_CHANNEL_TOKEN: TEST_TOKEN,
      LESUTO_API_URL: 'https://api.lesuto.com',
    },
    fn,
  );
}

export function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
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
