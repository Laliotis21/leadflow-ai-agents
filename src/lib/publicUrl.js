// Public base URL of the deployed service.
//
// Render injects RENDER_EXTERNAL_URL automatically, so nothing has to be
// configured by hand after the first deploy. PUBLIC_BASE_URL overrides it when
// a custom domain is in front of the service.
//
// There is deliberately no localhost fallback: a wrong base URL would ship
// dead unsubscribe links inside real emails.

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '')
  .trim()
  .replace(/\/+$/, '');

function getPublicBaseUrl() {
  return PUBLIC_BASE_URL;
}

function isPublicUrlConfigured() {
  return /^https?:\/\//i.test(PUBLIC_BASE_URL);
}

module.exports = { getPublicBaseUrl, isPublicUrlConfigured };
