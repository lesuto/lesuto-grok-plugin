#!/usr/bin/env node
/**
 * Lesuto merchant Grok MCP (stdio JSON-RPC).
 * Auth: LESUTO_AGENT_KEY + LESUTO_CHANNEL_TOKEN. Always api.lesuto.com, never admin.lesuto.com.
 */
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { adminGraphql, apiBase, redactSecrets } from './lib/graphql.mjs';
import { deniedOp, extractFields } from './lib/denied-ops.mjs';
import { connectTools } from './tools/connect.mjs';
import { commerceTools } from './tools/commerce.mjs';
import { hubTools } from './tools/hub.mjs';
import { blogTools } from './tools/blog.mjs';

const PROTOCOL = '2024-11-05';

const TOOLS = [
  {
    name: 'lesuto_graphql',
    description: 'Run a Lesuto admin GraphQL query or mutation as this channel administrator. Destructive mutations require confirm true. Never mint agent keys, never call CRM staff ops.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        variables: { type: 'object' },
        confirm: { type: 'boolean' },
      },
      required: ['query'],
    },
    execute: (args) => adminGraphql(String(args.query || ''), args.variables || {}, args),
  },
  ...connectTools,
  ...commerceTools,
  ...hubTools,
  ...blogTools,
];

function jsonText(payload, isError = false) {
  return {
    content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function toolList() {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.destructiveHint ? { annotations: { destructiveHint: true } } : {}),
    })),
  };
}

function initializeResult() {
  return {
    protocolVersion: PROTOCOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'lesuto-grok', version: '1.0.0' },
    instructions:
      'You are acting as this merchant or supplier on their Lesuto channel. Use named tools for bookings, orders, catalog, analytics, Hub, blog, shipping, and site status. Destructive tools require confirm true. Always call api.lesuto.com.',
  };
}

async function handle(msg) {
  const id = msg.id === undefined ? null : msg.id;
  const method = String(msg.method || '');
  if (method.startsWith('notifications/')) return null;
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: initializeResult() };
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: toolList() };
  if (method === 'tools/call') {
    const name = String(msg.params?.name || '');
    const args = msg.params?.arguments || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { jsonrpc: '2.0', id, result: jsonText(`Unknown tool: ${name}`, true) };
    }
    try {
      const data = await tool.execute(args);
      return { jsonrpc: '2.0', id, result: jsonText(data) };
    } catch (err) {
      return { jsonrpc: '2.0', id, result: jsonText(redactSecrets(err.message || String(err)), true) };
    }
  }
  if (!method) {
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export { adminGraphql, apiBase, deniedOp, extractFields, handle, redactSecrets, TOOLS };

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.mjs')) {
  const rl = createInterface({ input: stdin });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      const out = await handle(msg);
      if (out) stdout.write(`${JSON.stringify(out)}\n`);
    } catch (err) {
      stderr.write(`${redactSecrets(err.message)}\n`);
    }
  });
}
