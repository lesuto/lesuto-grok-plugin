/**
 * Agent key resolution and auth-failure reporting.
 *
 * Grok connectors expose the secret as LESUTO_AGENT_KEY_GROK; other hosts use
 * LESUTO_AGENT_KEY. The Grok-specific name wins so one machine can hold both.
 * Unset interpolations (`${NAME}` left literal by a host) and blanks count as unset.
 */

export const AGENT_KEY_ENV_ORDER = ['LESUTO_AGENT_KEY_GROK', 'LESUTO_AGENT_KEY'];

function usable(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^\$\{[^}]*\}$/.test(v)) return '';
  return v;
}

/** @returns {{ key: string, source: string } | null} */
export function resolveAgentKey(env = process.env) {
  for (const name of AGENT_KEY_ENV_ORDER) {
    const key = usable(env[name]);
    if (key) return { key, source: name };
  }
  return null;
}

/** Every configured key, so redaction covers both env vars. */
export function allAgentKeys(env = process.env) {
  return AGENT_KEY_ENV_ORDER.map((name) => usable(env[name])).filter(Boolean);
}

export function missingKeyMessage() {
  return `Set ${AGENT_KEY_ENV_ORDER[0]} or ${AGENT_KEY_ENV_ORDER[1]} (Command Center or Seller → AI Agent Access).`;
}

export function keyTail(key) {
  const k = String(key || '');
  return k.length >= 4 ? k.slice(-4) : '';
}

/**
 * Message for a 401/403 from the admin GraphQL endpoint. The server keeps invalid,
 * revoked and unknown keys indistinguishable on purpose, so the caller is told which
 * of its own env vars was sent (label plus last 4 characters of its own secret), the
 * HTTP status and server code, and the permission the server named, if any.
 */
export function describeAuthFailure({ status, code, message, source, key }) {
  const tail = keyTail(key);
  const label = source ? `${source}${tail ? ` (ending ${tail})` : ''}` : 'no key configured';
  const server = String(message || '').trim();
  const lines = [`Lesuto rejected the agent key: HTTP ${status}${code ? ` ${code}` : ''}.`, `Key sent: ${label}.`];
  if (status === 403) {
    lines.push(`Missing permission: ${server || 'the server did not name one; check the key jobs and stores in AI Agent Access.'}`);
  } else {
    lines.push(
      `${server || 'Authentication required'}. The key was not accepted (invalid, revoked, expired, or from a different environment). ` +
        'No permission is reported for a rejected key; mint or rotate one in AI Agent Access.',
    );
  }
  return lines.join(' ');
}
