// Render free web services idle out after ~15 min of no traffic.
// This self-pings the public URL to keep the single process warm 24/7.
// The URL comes from RENDER_EXTERNAL_URL (injected by Render) or PUBLIC_BASE_URL.

const { getPublicBaseUrl, isPublicUrlConfigured } = require('../lib/publicUrl');

const KEEPALIVE_INTERVAL_MS = Number(process.env.KEEPALIVE_INTERVAL_MS) || 14 * 60 * 1000; // 14 min

function startKeepAlive() {
  if (!isPublicUrlConfigured()) {
    console.log('[keepalive] no public URL (PUBLIC_BASE_URL / RENDER_EXTERNAL_URL) — self-ping disabled');
    return;
  }

  const target = `${getPublicBaseUrl()}/api/health`;
  console.log(`[keepalive] pinging ${target} every ${Math.round(KEEPALIVE_INTERVAL_MS / 60000)} min`);

  const timer = setInterval(async () => {
    try {
      const res = await fetch(target, { method: 'GET' });
      if (!res.ok) console.warn(`[keepalive] ping returned ${res.status}`);
    } catch (error) {
      console.warn('[keepalive] ping failed:', error.message);
    }
  }, KEEPALIVE_INTERVAL_MS);

  if (timer.unref) timer.unref();
}

module.exports = { startKeepAlive };
