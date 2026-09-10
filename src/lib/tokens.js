const crypto = require('crypto');

// Secret used to sign unsubscribe links. Falls back to a per-process random
// value if unset (links won't survive restarts, but stay unforgeable).
const SECRET = process.env.UNSUBSCRIBE_SECRET || crypto.randomBytes(32).toString('hex');

function sign(leadId) {
  return crypto
    .createHmac('sha256', SECRET)
    .update(String(leadId))
    .digest('hex')
    .slice(0, 32);
}

function makeUnsubscribeToken(leadId) {
  return sign(leadId);
}

function verifyUnsubscribeToken(leadId, token) {
  if (!leadId || !token) return false;
  const expected = sign(leadId);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { makeUnsubscribeToken, verifyUnsubscribeToken };
