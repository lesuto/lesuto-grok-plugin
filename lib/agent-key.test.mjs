import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgentKey, allAgentKeys, describeAuthFailure, keyTail, missingKeyMessage } from './agent-key.mjs';
import { adminGraphql } from './graphql.mjs';
import { jsonResponse, withEnv, withMockFetch } from '../test/helpers.mjs';

// Built from parts so the public-leak scanner never sees a key-shaped literal.
const k = (tail) => ['lsk', 'test', tail].join('_');

test('Grok-specific key wins over the generic key', () => {
  const env = { LESUTO_AGENT_KEY_GROK: k('grok1234'), LESUTO_AGENT_KEY: k('generic9') };
  assert.deepEqual(resolveAgentKey(env), { key: k('grok1234'), source: 'LESUTO_AGENT_KEY_GROK' });
});

test('generic key is used when only it is set', () => {
  assert.deepEqual(resolveAgentKey({ LESUTO_AGENT_KEY: k('generic9') }), {
    key: k('generic9'),
    source: 'LESUTO_AGENT_KEY',
  });
});

test('only the Grok key set works (the reported repro)', () => {
  assert.equal(resolveAgentKey({ LESUTO_AGENT_KEY_GROK: k('grok1234') })?.source, 'LESUTO_AGENT_KEY_GROK');
});

test('blank and uninterpolated values count as unset and fall through', () => {
  const env = { LESUTO_AGENT_KEY_GROK: '${LESUTO_AGENT_KEY_GROK}', LESUTO_AGENT_KEY: k('generic9') };
  assert.equal(resolveAgentKey(env)?.source, 'LESUTO_AGENT_KEY');
  assert.equal(resolveAgentKey({ LESUTO_AGENT_KEY_GROK: '  ' }), null);
  assert.equal(resolveAgentKey({}), null);
});

test('allAgentKeys lists every configured key for redaction', () => {
  const env = { LESUTO_AGENT_KEY_GROK: 'a-grok-key-1', LESUTO_AGENT_KEY: 'a-generic-2' };
  assert.deepEqual(allAgentKeys(env), ['a-grok-key-1', 'a-generic-2']);
});

test('missing key message names both variables', () => {
  assert.match(missingKeyMessage(), /LESUTO_AGENT_KEY_GROK/);
  assert.match(missingKeyMessage(), /LESUTO_AGENT_KEY\b/);
});

test('keyTail returns the last 4 characters only', () => {
  assert.equal(keyTail(k('abcdwxyz')), 'wxyz');
  assert.equal(keyTail('abc'), '');
});

test('403 failure reports label, last 4, status, code, and the missing permission', () => {
  const msg = describeAuthFailure({
    status: 403,
    code: 'AGENT_KEY_SCOPE_DENIED',
    message: "Operation 'updateProduct' is not allowed for scope 'connect'",
    source: 'LESUTO_AGENT_KEY_GROK',
    key: k('abcdwxyz'),
  });
  assert.match(msg, /HTTP 403 AGENT_KEY_SCOPE_DENIED/);
  assert.match(msg, /LESUTO_AGENT_KEY_GROK \(ending wxyz\)/);
  assert.match(msg, /Missing permission: Operation 'updateProduct' is not allowed for scope 'connect'/);
  assert.ok(!msg.includes(k('abcdwxyz')));
});

test('401 failure is honest that no permission is reported for a rejected key', () => {
  const msg = describeAuthFailure({
    status: 401,
    code: 'AGENT_KEY_INVALID',
    message: 'Authentication required',
    source: 'LESUTO_AGENT_KEY',
    key: k('abcdwxyz'),
  });
  assert.match(msg, /HTTP 401 AGENT_KEY_INVALID/);
  assert.match(msg, /LESUTO_AGENT_KEY \(ending wxyz\)/);
  assert.match(msg, /No permission is reported/);
  assert.doesNotMatch(msg, /Missing permission/);
});

test('adminGraphql sends the Grok key and surfaces a 401 with its label and tail', async () => {
  await withEnv({
    LESUTO_AGENT_KEY_GROK: k('grokwxyz'),
    LESUTO_AGENT_KEY: undefined,
    LESUTO_CHANNEL_TOKEN: 'merchant_demo_admin',
  }, async () => {
    await withMockFetch((_url, init) => {
      assert.equal(init.headers['X-Lesuto-Agent-Key'], k('grokwxyz'));
      return jsonResponse(401, { errors: [{ message: 'Authentication required', extensions: { code: 'AGENT_KEY_INVALID' } }] });
    }, async () => {
      await assert.rejects(
        () => adminGraphql('query { me { id } }'),
        (err) => /LESUTO_AGENT_KEY_GROK \(ending wxyz\)/.test(err.message) && !err.message.includes(k('grokwxyz')),
      );
    });
  });
});

test('adminGraphql surfaces a 403 scope denial as a missing permission', async () => {
  await withEnv({
    LESUTO_AGENT_KEY_GROK: undefined,
    LESUTO_AGENT_KEY: k('generic1'),
    LESUTO_CHANNEL_TOKEN: 'merchant_demo_admin',
  }, async () => {
    await withMockFetch(() => jsonResponse(403, {
      errors: [{ message: "Operation 'x' is not allowed for scope 'sites'", extensions: { code: 'AGENT_KEY_SCOPE_DENIED' } }],
    }), async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /Missing permission: Operation 'x' is not allowed for scope 'sites'/);
    });
  });
});
