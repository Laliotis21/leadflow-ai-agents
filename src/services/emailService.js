const { Resend } = require('resend');
const { supabase, isSupabaseConfigured } = require('../lib/supabase');
const { makeUnsubscribeToken } = require('../lib/tokens');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'LeadFlow';
const EMAIL_DAILY_LIMIT = parseInt(process.env.EMAIL_DAILY_LIMIT || '80', 10);
const EMAIL_MONTHLY_LIMIT = parseInt(process.env.EMAIL_MONTHLY_LIMIT || '2500', 10);
const EMAIL_TEST_REDIRECT = (process.env.EMAIL_TEST_REDIRECT || '').trim();
const EMAIL_REPLY_TO = (process.env.EMAIL_REPLY_TO || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').trim();

const isEmailConfigured = !!RESEND_API_KEY && RESEND_API_KEY !== 'your_resend_api_key_here';
const resend = isEmailConfigured ? new Resend(RESEND_API_KEY) : null;

// Local fallback counters if Supabase is unavailable
let localDailyCount = 0;
let localMonthlyCount = 0;
let lastResetDay = new Date().toISOString().slice(0, 10);
let lastResetMonth = new Date().toISOString().slice(0, 7);

function checkLocalReset() {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  if (today !== lastResetDay) {
    localDailyCount = 0;
    lastResetDay = today;
  }
  if (month !== lastResetMonth) {
    localMonthlyCount = 0;
    lastResetMonth = month;
  }
}

// Short-lived cache so frequent health/dashboard pings don't hit Supabase
// on every call. Invalidated whenever an email is actually sent.
const USAGE_TTL_MS = 10 * 1000;
let usageCache = null;
let usageCacheAt = 0;

function invalidateUsageCache() {
  usageCache = null;
  usageCacheAt = 0;
}

async function getEmailUsage() {
  if (usageCache && Date.now() - usageCacheAt < USAGE_TTL_MS) {
    return usageCache;
  }

  checkLocalReset();

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  let dailyCount = localDailyCount;
  let monthlyCount = localMonthlyCount;

  if (isSupabaseConfigured && supabase) {
    try {
      const { count: dayTotal } = await supabase
        .from('outreach_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', startOfDay);
      if (typeof dayTotal === 'number') dailyCount = dayTotal;

      const { count: monthTotal } = await supabase
        .from('outreach_logs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', startOfMonth);
      if (typeof monthTotal === 'number') monthlyCount = monthTotal;
    } catch (err) {
      console.warn('[EmailService] usage lookup failed:', err.message);
    }
  }

  const isDailyExceeded = dailyCount >= EMAIL_DAILY_LIMIT;
  const isMonthlyExceeded = monthlyCount >= EMAIL_MONTHLY_LIMIT;

  let blockReason = null;
  if (isMonthlyExceeded) {
    blockReason = `Monthly email limit reached (${monthlyCount}/${EMAIL_MONTHLY_LIMIT}). Paused to stay on free tier.`;
  } else if (isDailyExceeded) {
    blockReason = `Daily email limit reached (${dailyCount}/${EMAIL_DAILY_LIMIT}). Resumes tomorrow.`;
  }

  usageCache = {
    configured: isEmailConfigured,
    from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
    testRedirect: EMAIL_TEST_REDIRECT || null,
    dailyCount,
    dailyLimit: EMAIL_DAILY_LIMIT,
    remainingDay: Math.max(0, EMAIL_DAILY_LIMIT - dailyCount),
    monthlyCount,
    monthlyLimit: EMAIL_MONTHLY_LIMIT,
    remainingMonth: Math.max(0, EMAIL_MONTHLY_LIMIT - monthlyCount),
    isBlocked: isDailyExceeded || isMonthlyExceeded,
    blockReason,
  };
  usageCacheAt = Date.now();
  return usageCache;
}

async function logOutreach(entry) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('outreach_logs').insert(entry);
  } catch (err) {
    console.warn('[EmailService] failed to log outreach:', err.message);
  }
}

/**
 * Send a single outreach email through Resend, guarded by free-tier limits.
 */
async function sendEmail({ leadId, to, subject, html, text, template = 'cold-email-v1', step = 1 }) {
  if (!to) {
    return { ok: false, skipped: true, reason: 'missing_recipient' };
  }

  const unsubToken = makeUnsubscribeToken(leadId || '');
  const unsubUrl = `${PUBLIC_BASE_URL}/unsubscribe?lead=${encodeURIComponent(leadId || '')}&t=${unsubToken}`;
  const extraHeaders = {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  // Not configured yet: simulate so the pipeline still works locally
  if (!isEmailConfigured) {
    await logOutreach({
      lead_id: leadId,
      provider: 'resend',
      to_email: to,
      subject,
      body: text || html,
      template,
      status: 'simulated',
      step,
    });
    return { ok: true, simulated: true, reason: 'no_api_key' };
  }

  const usage = await getEmailUsage();
  if (usage.isBlocked) {
    await logOutreach({
      lead_id: leadId,
      provider: 'resend',
      to_email: to,
      subject,
      body: text || html,
      template,
      status: 'rate_limited',
      error: usage.blockReason,
      step,
    });
    return { ok: false, blocked: true, reason: usage.blockReason };
  }

  const recipient = EMAIL_TEST_REDIRECT || to;

  try {
    const payload = {
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      to: recipient,
      subject,
      html,
      text,
      headers: extraHeaders,
    };
    if (EMAIL_REPLY_TO) payload.replyTo = EMAIL_REPLY_TO;

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      await logOutreach({
        lead_id: leadId,
        provider: 'resend',
        to_email: recipient,
        subject,
        body: text || html,
        template,
        status: 'failed',
        error: error.message || String(error),
        step,
      });
      return { ok: false, error: error.message || String(error) };
    }

    checkLocalReset();
    localDailyCount += 1;
    localMonthlyCount += 1;
    invalidateUsageCache();

    await logOutreach({
      lead_id: leadId,
      provider: 'resend',
      to_email: recipient,
      subject,
      body: text || html,
      template,
      status: 'sent',
      message_id: data?.id || null,
      step,
    });

    return { ok: true, messageId: data?.id || null, redirected: !!EMAIL_TEST_REDIRECT };
  } catch (err) {
    await logOutreach({
      lead_id: leadId,
      provider: 'resend',
      to_email: recipient,
      subject,
      body: text || html,
      template,
      status: 'failed',
      error: err.message,
      step,
    });
    return { ok: false, error: err.message };
  }
}

module.exports = {
  isEmailConfigured,
  getEmailUsage,
  sendEmail,
};
