import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pluginRoot } from './test/helpers.mjs';

const read = (rel) => readFileSync(join(pluginRoot, rel), 'utf8');

test('plugin sources never hardcode the admin API host', () => {
  for (const rel of ['server.mjs', 'lib/graphql.mjs', 'README.md', 'package.json']) {
    const src = read(rel);
    assert.equal(src.includes('https://admin.lesuto.com'), false, rel);
  }
  assert.match(read('server.mjs'), /Always api\.lesuto\.com/);
  assert.equal(read('server.mjs').includes('admin.lesuto.com'), false);
  assert.match(read('lib/graphql.mjs'), /api\.lesuto\.com/);
});

test('plugin sources do not log agent secrets', () => {
  for (const rel of ['server.mjs', 'lib/graphql.mjs']) {
    const src = read(rel);
    assert.equal(/console\.(log|info|debug|error|warn)\([^)]*LESUTO_AGENT_KEY/.test(src), false);
    assert.equal(/stderr\.write\([^)]*LESUTO_AGENT_KEY/.test(src), false);
  }
  assert.match(read('lib/graphql.mjs'), /redirect: 'error'/);
});

test('package has no install-time network and no runtime deps', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts?.postinstall, undefined);
  assert.equal(pkg.scripts?.preinstall, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.match(pkg.scripts.test, /^node --test --test-concurrency=1 /);
  assert.match(pkg.engines.node, /20/);
  assert.equal(existsSync(join(pluginRoot, 'test.mjs')), false);
  assert.equal(existsSync(join(pluginRoot, 'tests')), false);
});

test('MCP manifest interpolates secrets and pins the API', () => {
  const mcp = JSON.parse(read('.mcp.json'));
  const lesuto = mcp.mcpServers.lesuto;
  assert.equal(lesuto.command, 'node');
  assert.deepEqual(lesuto.args, ['${GROK_PLUGIN_ROOT}/server.mjs']);
  assert.equal(lesuto.env.LESUTO_API_URL, 'https://api.lesuto.com');
  assert.equal(lesuto.env.LESUTO_AGENT_KEY, '${LESUTO_AGENT_KEY}');
  assert.equal(lesuto.env.LESUTO_CHANNEL_TOKEN, '${LESUTO_CHANNEL_TOKEN}');
});

test('Grok plugin.json has homepage, license, icon, and brand keywords', () => {
  const manifest = JSON.parse(read('.grok-plugin/plugin.json'));
  const rootManifest = JSON.parse(read('plugin.json'));
  assert.deepEqual(manifest, rootManifest);
  assert.equal(manifest.name, 'lesuto');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.homepage, 'https://www.lesuto.com/integrations/grok-agent');
  assert.equal(manifest.icon, 'assets/lesuto-mark.png');
  assert.ok(manifest.keywords.includes('lesuto'));
  assert.ok(existsSync(join(pluginRoot, 'assets/lesuto-mark.png')));
  assert.equal(existsSync(join(pluginRoot, 'assets/lesuto-wordmark.svg')), false);
  assert.ok(existsSync(join(pluginRoot, 'assets/lesuto-wordmark.png')));
  const mark = readFileSync(join(pluginRoot, 'assets/lesuto-mark.png'));
  const wordmark = readFileSync(join(pluginRoot, 'assets/lesuto-wordmark.png'));
  assert.equal(mark.readUInt32BE(16), 256);
  assert.equal(mark.readUInt32BE(20), 256);
  assert.equal(wordmark.readUInt32BE(16), 1024);
  assert.equal(wordmark.readUInt32BE(20), 1024);
  assert.ok(mark.byteLength < 40_000, 'plugin icon should be the sharp 256 handshake, not the old blurry 378KB file');
  assert.ok(existsSync(join(pluginRoot, 'LICENSE')));
  assert.match(read('LICENSE'), /Lesuto Technologies/);
});

test('README has logo, signup, install, secrets, and no internal jargon', () => {
  const readme = read('README.md');
  assert.match(readme, /assets\/lesuto-mark\.png/);
  assert.match(readme, /https:\/\/www\.lesuto\.com\/signup/);
  assert.match(readme, /LESUTO_AGENT_KEY/);
  assert.match(readme, /LESUTO_CHANNEL_TOKEN/);
  assert.match(readme, /AI Agent Access/);
  assert.match(readme, /Grok Build/);
  assert.match(readme, /Let's Succeed Together/);
  assert.match(readme, /grok plugin install lesuto\/lesuto-grok-plugin/);
  assert.match(readme, /60/);
  assert.match(readme, /integration credit/);
  for (const banned of [
    'SuperAdmin', 'Vendure', 'NestJS', 'TypeORM', 'Elasticsearch',
    'UpdateInternalPlatform', 'ReadInternalPlatform', 'internal-superadmin',
    'X-Lesuto-Agent-Key', 'X-Crm-Agent-Token',
  ]) {
    assert.equal(readme.includes(banned), false, banned);
  }
});

test('marketplace packet pins a 40-char SHA and the public repo', () => {
  const doc = read('docs/grok-marketplace-submission.md');
  assert.match(doc, /github\.com\/lesuto\/lesuto-grok-plugin/);
  assert.match(doc, /xai-org\/plugin-marketplace/);
  assert.match(doc, /plugin-marketplace\/pull\/828/);
  assert.match(doc, /publish-lesuto-grok-plugin\.yml/);
  assert.match(doc, /"sha": "[a-f0-9]{40}"/);
  assert.match(doc, /Code-owner review is required/);
});

test('monorepo publish workflow mirrors plugin changes to the public repo', () => {
  const wf = join(pluginRoot, '../.github/workflows/publish-lesuto-grok-plugin.yml');
  if (!existsSync(wf)) return;
  const yaml = readFileSync(wf, 'utf8');
  assert.match(yaml, /lesuto-grok-plugin\/\*\*/);
  assert.match(yaml, /publish-lesuto-grok-plugin\.sh/);
  assert.match(yaml, /LESUTO_GROK_PLUGIN_DEPLOY_KEY/);
  assert.match(yaml, /environment: grok-plugin/);
  assert.match(yaml, /branches: \[develop\]/);
});

test('README rate limits match the gateway constants', () => {
  const limitsPath = join(pluginRoot, '../api-service/internal/gateway/grok_ratelimit.go');
  if (!existsSync(limitsPath)) return;
  const go = readFileSync(limitsPath, 'utf8');
  const minute = go.match(/grokPerMinuteLimit\s*=\s*(\d+)/)[1];
  const hour = go.match(/grokPerHourLimit\s*=\s*(\d+)/)[1];
  const writes = go.match(/grokWriteLimit\s*=\s*(\d+)/)[1];
  const readme = read('README.md');
  assert.match(readme, new RegExp(`\\*\\*${minute}\\*\\*/minute`));
  assert.match(readme, new RegExp(`\\*\\*${hour}\\*\\*/hour`));
  assert.match(readme, new RegExp(`\\*\\*${writes}\\*\\*/minute`));
});
