import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminGraphql, apiBase, redactSecrets } from './lib/graphql.mjs';
import { jsonResponse, withAgentEnv, withEnv, withMockFetch } from './test/helpers.mjs';

test('apiBase defaults to production API and trims trailing slash', () => {
  withEnv({ LESUTO_API_URL: undefined }, () => assert.equal(apiBase(), 'https://api.lesuto.com'));
  withEnv({ LESUTO_API_URL: 'https://api.lesuto.com/' }, () => assert.equal(apiBase(), 'https://api.lesuto.com'));
  withEnv({ LESUTO_API_URL: 'https://staging-api.lesuto.com' }, () => {
    assert.equal(apiBase(), 'https://staging-api.lesuto.com');
  });
});

test('apiBase rejects SSRF, http, credentials, ports, and paths', () => {
  for (const bad of [
    'http://api.lesuto.com',
    'https://admin.lesuto.com',
    'https://127.0.0.1',
    'https://localhost',
    'https://api.lesuto.com.evil.test',
    'https://evil.test',
    'https://user:pass@api.lesuto.com',
    'https://api.lesuto.com/hack',
    'https://api.lesuto.com:8443',
    'https://api.lesuto.com?next=https://evil.test',
    'https://api.lesuto.com#x',
    'not-a-url',
  ]) {
    withEnv({ LESUTO_API_URL: bad }, () => {
      assert.throws(() => apiBase(), /LESUTO_API_URL/);
    });
  }
});

test('redactSecrets never echoes live env values', () => {
  withAgentEnv(() => {
    const out = redactSecrets('key=lsk_test_secretvalue token=merchant_demo_admin');
    assert.equal(out.includes('lsk_test_secretvalue'), false);
    assert.equal(out.includes('merchant_demo_admin'), false);
    assert.match(out, /\[redacted\]/);
  });
});

test('adminGraphql requires both secrets before fetch', async () => {
  await withMockFetch(() => {
    throw new Error('fetch should not run');
  }, async (calls) => {
    await withEnv({ LESUTO_AGENT_KEY: undefined, LESUTO_CHANNEL_TOKEN: undefined }, async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /LESUTO_AGENT_KEY/);
    });
    await withEnv({ LESUTO_AGENT_KEY: 'lsk_test_x', LESUTO_CHANNEL_TOKEN: undefined }, async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /LESUTO_CHANNEL_TOKEN/);
    });
    assert.equal(calls.length, 0);
  });
});

test('adminGraphql POSTs pinned URL with grok headers and no follow', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      assert.equal(init.redirect, 'error');
      assert.equal(init.method, 'POST');
      const headers = init.headers;
      assert.equal(headers['X-Lesuto-Agent-Key'], 'lsk_test_secretvalue');
      assert.equal(headers['X-Lesuto-Client'], 'grok');
      assert.equal(headers['vendure-token'], 'merchant_demo_admin');
      assert.equal(headers.Authorization, undefined);
      assert.equal(headers['X-Crm-Agent-Token'], undefined);
      assert.equal(headers['X-Tenant-Api-Key'], undefined);
      const body = JSON.parse(init.body);
      assert.equal(body.query, 'query Q { me { id } }');
      return jsonResponse(200, { data: { me: { id: '1' } } });
    }, async (calls) => {
      const data = await adminGraphql('query Q { me { id } }');
      assert.deepEqual(data, { me: { id: '1' } });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.lesuto.com/api/v3/admin/graphql');
    });
  });
});

test('adminGraphql refuses denied operations without fetching', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(200, { data: {} }), async (calls) => {
      await assert.rejects(
        () => adminGraphql('query { issueAgentAccessKey { secret } }'),
        /not permitted/,
      );
      await assert.rejects(
        () => adminGraphql('query { crmAgentBriefing { id } }'),
        /not permitted/,
      );
      assert.equal(calls.length, 0);
    });
  });
});

test('adminGraphql requires confirm on destructive mutations', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(200, { data: { cancelOrder: { id: '1' } } }), async (calls) => {
      await assert.rejects(
        () => adminGraphql('mutation { cancelOrder(id: "1") { id } }'),
        /confirm/,
      );
      assert.equal(calls.length, 0);
      const data = await adminGraphql('mutation { cancelOrder(id: "1") { id } }', {}, { confirm: true });
      assert.equal(data.cancelOrder.id, '1');
      assert.equal(calls.length, 1);
    });
  });
});

test('adminGraphql maps HTTP 402 and 429 and GraphQL errors', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(402, { errors: [{ message: 'Payment required' }] }), async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /Payment required/);
    });
    await withMockFetch(() => jsonResponse(429, { errors: [{ message: 'Rate limit exceeded' }] }), async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /Rate limit exceeded/);
    });
    await withMockFetch(() => jsonResponse(401, {}), async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /HTTP 401/);
    });
    await withMockFetch(() => jsonResponse(200, { errors: [{ message: 'nope' }, { message: 'also' }] }), async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), /nope; also/);
    });
  });
});

test('adminGraphql redacts secrets from fetch failures', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => {
      throw new Error('upstream failed lsk_test_secretvalue merchant_demo_admin');
    }, async () => {
      await assert.rejects(() => adminGraphql('query { me { id } }'), (err) => {
        assert.equal(String(err.message).includes('lsk_test_secretvalue'), false);
        assert.equal(String(err.message).includes('merchant_demo_admin'), false);
        assert.match(err.message, /\[redacted\]/);
        return true;
      });
    });
  });
});
