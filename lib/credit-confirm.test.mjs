import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT_TOOL_COSTS, isCreditTool, wrapCreditTool } from './credit-confirm.mjs';

test('credit tools cover studio spend paths', () => {
  for (const name of [
    'studio_scripts_generate',
    'studio_script_revise',
    'studio_keyframes',
    'studio_render_scenes',
    'studio_produce_video',
    'social_generate_image',
  ]) {
    assert.equal(isCreditTool(name), true, name);
    assert.ok(CREDIT_TOOL_COSTS[name].field);
  }
  assert.equal(isCreditTool('studio_scenes'), false);
});

test('wrapCreditTool adds confirm', () => {
  const wrapped = wrapCreditTool({
    name: 'studio_keyframes',
    description: 'Generate cheap stills.',
    inputSchema: { type: 'object', properties: { scriptId: { type: 'string' } } },
    execute: () => ({ ok: true }),
  });
  assert.match(wrapped.description, /confirm true/);
  assert.equal(wrapped.inputSchema.properties.confirm.type, 'boolean');
});
