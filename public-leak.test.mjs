import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, extname, join, relative } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isBinaryPluginFile, pluginRoot, walkPluginFiles } from './test/helpers.mjs';
import {
  ALLOWED_CHANNEL_TOKENS,
  FORBIDDEN_BASENAMES,
  FORBIDDEN_EXTENSIONS,
  PUBLIC_COPY_REL,
  findChannelTokenLeaks,
  findCredentialLeaks,
  findHouseStoreLeaks,
  findPublicCopyLeaks,
} from './test/public-leak-patterns.mjs';

const rel = (abs) => relative(pluginRoot, abs);

function publishedTextFiles() {
  return walkPluginFiles().filter((p) => !isBinaryPluginFile(p));
}

test('scanner flags live keys and ignores placeholders', () => {
  assert.deepEqual(findCredentialLeaks('LESUTO_AGENT_KEY=lsk_live_YOUR_KEY'), []);
  assert.deepEqual(findCredentialLeaks('LESUTO_AGENT_KEY=lsk_live_…'), []);
  assert.deepEqual(findCredentialLeaks('LESUTO_AGENT_KEY=lsk_test_secretvalue'), []);
  const live = 'lsk_live_' + 'ab'.repeat(16);
  assert.ok(findCredentialLeaks(`key=${live}`).includes(live));
  const stripe = 'sk_live_' + 'Cd'.repeat(12);
  assert.ok(findCredentialLeaks(stripe).includes(stripe));
});

test('scanner flags real store tokens and ignores demo placeholders', () => {
  assert.deepEqual(findChannelTokenLeaks('merchant_your-slug_admin'), []);
  assert.deepEqual(findChannelTokenLeaks('merchant_demo_admin'), []);
  const house = ['merchant_', ['lesuto', 'technologies', 'inc'].join('-'), '_admin'].join('');
  assert.ok(findChannelTokenLeaks(house).includes(house));
  const glen = ['merchant', 'glen', 'admin'].join('_');
  assert.ok(findHouseStoreLeaks(glen).length > 0);
});

test('public plugin packet has no live keys, private key files, or house store tokens', () => {
  const leaks = [];
  for (const name of FORBIDDEN_BASENAMES) {
    if (existsSync(join(pluginRoot, name))) leaks.push(`forbidden file ${name}`);
  }
  for (const abs of walkPluginFiles()) {
    const base = basename(abs);
    const ext = extname(abs).toLowerCase();
    if (FORBIDDEN_BASENAMES.has(base)) leaks.push(`${rel(abs)}: forbidden filename`);
    if (FORBIDDEN_EXTENSIONS.has(ext)) leaks.push(`${rel(abs)}: forbidden extension`);
    if (isBinaryPluginFile(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    for (const hit of findCredentialLeaks(text)) leaks.push(`${rel(abs)}: credential ${hit}`);
    for (const hit of findChannelTokenLeaks(text)) leaks.push(`${rel(abs)}: channel token ${hit}`);
    for (const hit of findHouseStoreLeaks(text)) leaks.push(`${rel(abs)}: house store ${hit}`);
  }
  assert.deepEqual(leaks, []);
});

test('merchant-facing copy has no internal jargon or private hosts', () => {
  const leaks = [];
  const skillRoot = join(pluginRoot, 'skills');
  const copy = PUBLIC_COPY_REL.map((p) => join(pluginRoot, p));
  if (existsSync(skillRoot)) {
    for (const name of readdirSync(skillRoot)) {
      const skill = join(skillRoot, name, 'SKILL.md');
      if (existsSync(skill) && statSync(skill).isFile()) copy.push(skill);
    }
  }
  for (const abs of copy) {
    const text = readFileSync(abs, 'utf8');
    for (const hit of findPublicCopyLeaks(text)) leaks.push(`${rel(abs)}: ${hit}`);
  }
  assert.deepEqual(leaks, []);
});

test('MCP secrets stay interpolated; runtime reads env only', () => {
  const mcp = JSON.parse(readFileSync(join(pluginRoot, '.mcp.json'), 'utf8'));
  const env = mcp.mcpServers.lesuto.env;
  assert.equal(env.LESUTO_AGENT_KEY, '${LESUTO_AGENT_KEY}');
  assert.equal(env.LESUTO_CHANNEL_TOKEN, '${LESUTO_CHANNEL_TOKEN}');
  assert.match(env.LESUTO_API_URL, /^https:\/\/(staging-)?api\.lesuto\.com$/);
  const graphql = readFileSync(join(pluginRoot, 'lib/graphql.mjs'), 'utf8');
  assert.match(graphql, /process\.env\.LESUTO_AGENT_KEY/);
  assert.equal(findCredentialLeaks(graphql).length, 0);
  assert.doesNotMatch(graphql, /lsk_live_[A-Za-z0-9]{16,}/);
});

test('publish script only mirrors the plugin folder and drops secret files', () => {
  const script = join(pluginRoot, '../scripts/publish-lesuto-grok-plugin.sh');
  if (!existsSync(script)) return;
  const sh = readFileSync(script, 'utf8');
  assert.match(sh, /SRC="\$REPO_ROOT\/lesuto-grok-plugin"/);
  assert.match(sh, /rsync -a --delete/);
  assert.match(sh, /"\$SRC\/" "\$WORKDIR\/repo\/"/);
  for (const exclude of ['.git', 'node_modules', '.env', '.env.*', '*.pem', '*.key']) {
    assert.ok(sh.includes(`--exclude '${exclude}'`), exclude);
  }
  assert.doesNotMatch(sh, /chameleon-admin/);
  assert.doesNotMatch(sh, /LESUTO_AGENT_KEY=/);
});

test('demo channel tokens used in tests are on the allowlist', () => {
  for (const tok of ['merchant_demo_admin', 'merchant_north_admin', 'supplier_south_admin']) {
    assert.ok(ALLOWED_CHANNEL_TOKENS.has(tok), tok);
  }
  const files = publishedTextFiles();
  assert.ok(files.some((p) => p.endsWith('public-leak.test.mjs')));
});
