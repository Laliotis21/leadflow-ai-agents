// Free hosts (Render/Railway free) idle out after ~15 min of no traffic.
// This self-pings the public URL to keep the single process warm 24/7.
// Set PUBLIC_URL to your deployed URL (e.g. https://leadflow.onrender.com).

const KEEPALIVE_INTERVAL_MS = Number(process.env.KEEPALIVE_INTERVAL_MS) || 14 * 60 * 1000; // 14 min

function startKeepAlive() {
  const url = process.env.PUBLIC_URL;
  if (!url) {
    console.log('[keepalive] PUBLIC_URL not set — self-ping disabled');
    return;
  }

  const target = `${url.replace(/\/$/, '')}/api/health`;
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
