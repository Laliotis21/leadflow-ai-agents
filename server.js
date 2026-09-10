const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { supabase, isSupabaseConfigured } = require('./src/lib/supabase');
const { updateLead, addEvent } = require('./src/lib/leadsRepo');
const { discoverBusinesses } = require('./src/agents/discoveryAgent');
const { scanBusinesses } = require('./src/agents/scannerAgent');
const { qualifyBusinesses } = require('./src/agents/qualificationAgent');
const { sendOutreach } = require('./src/agents/outreachAgent');
const { runFollowUps } = require('./src/agents/followupAgent');
const { buildDashboardOverview } = require('./src/services/dashboardService');
const { searchPlaces } = require('./src/services/googlePlacesService');
const { getUsageStats } = require('./src/services/quotaGuard');
const { getEmailUsage, isEmailConfigured } = require('./src/services/emailService');
const { startScheduler, runPipelineOnce, getSchedulerStatus } = require('./src/services/scheduler');
const { startKeepAlive } = require('./src/services/keepAlive');
const { checkInboxForReplies, isImapConfigured } = require('./src/services/imapReplyService');
const { verifyUnsubscribeToken } = require('./src/lib/tokens');

const app = express();
const port = process.env.PORT || 3000;

// Shared secret protecting mutating endpoints. Set API_KEY in the environment.
// If unset, protected endpoints are disabled to avoid running open in production.
const API_KEY = (process.env.API_KEY || '').trim();

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(503).json({ ok: false, error: 'API_KEY not configured on server' });
  }
  const provided = (req.get('x-api-key') || '').trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length || !require('crypto').timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

app.get('/api/health', async (req, res) => {
  let supabaseStatus = 'not_configured';

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('leads').select('id').limit(1);
      supabaseStatus = error ? `error:${error.message}` : 'connected';
    } catch (error) {
      supabaseStatus = `error:${error.message}`;
    }
  }

  const hasGoogleKey = !!process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here';
  const quotaStats = await getUsageStats('google_maps');
  const emailUsage = await getEmailUsage();

  res.json({
    ok: true,
    service: 'leadflow-ai-agents',
    timestamp: new Date().toISOString(),
    supabase: {
      configured: isSupabaseConfigured,
      status: supabaseStatus,
      url: process.env.SUPABASE_URL || null,
    },
    googleMaps: {
      configured: hasGoogleKey,
      mode: hasGoogleKey ? (quotaStats.isBlocked ? 'blocked_quota' : 'live') : 'not_configured',
      quota: quotaStats,
    },
    email: {
      configured: isEmailConfigured,
      mode: isEmailConfigured ? (emailUsage.isBlocked ? 'blocked_quota' : 'live') : 'simulated',
      usage: emailUsage,
    },
    imap: {
      configured: isImapConfigured(),
      mode: isImapConfigured() ? 'live' : 'not_configured',
    },
  });
});

app.get('/api/email/stats', async (req, res) => {
  try {
    const usage = await getEmailUsage();
    res.json({ ok: true, usage });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/quota/stats', async (req, res) => {
  try {
    const stats = await getUsageStats('google_maps');
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/imap/status', async (req, res) => {
  try {
    const result = await checkInboxForReplies();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/scheduler/status', (req, res) => {
  res.json({ ok: true, scheduler: getSchedulerStatus() });
});

app.post('/api/scheduler/run', requireApiKey, async (req, res) => {
  try {
    const result = await runPipelineOnce();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const overview = await buildDashboardOverview();
    res.json(overview);
  } catch (error) {
    console.error('Dashboard overview failed:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/google-maps/search', requireApiKey, async (req, res) => {
  try {
    const { query, city = 'Athens', category = '', limit = 10 } = req.body || {};
    const result = await searchPlaces({ query, city, category, limit });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/agents/discovery/run', requireApiKey, async (req, res) => {
  try {
    const {
      city = 'Athens',
      category = 'Dentist',
      query = '',
      limit = 10,
      onlyWithoutWebsite = true,
    } = req.body || {};

    const result = await discoverBusinesses({
      city,
      category,
      query,
      limit,
      onlyWithoutWebsite,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/agents/scanner/run', requireApiKey, async (req, res) => {
  try {
    const result = await scanBusinesses();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/agents/qualification/run', requireApiKey, async (req, res) => {
  try {
    const result = await qualifyBusinesses();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/agents/outreach/run', requireApiKey, async (req, res) => {
  try {
    const result = await sendOutreach();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/agents/followup/run', requireApiKey, async (req, res) => {
  try {
    const result = await runFollowUps();
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/agents/reply-handler', requireApiKey, async (req, res) => {
  try {
    const { leadId, sentiment = 'positive' } = req.body || {};

    const lead = await updateLead(leadId, {
      status: sentiment === 'positive' ? 'replied' : 'dead',
      last_action: sentiment === 'positive' ? 'Prospect replied positively' : 'Marked dead after no interest',
    });

    await addEvent(leadId, 'Reply Handler Agent', 'reply_received', { sentiment });

    res.json({ ok: true, lead });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/unsubscribe', async (req, res) => {
  const leadId = req.query.lead;
  const token = req.query.t;
  try {
    if (leadId && verifyUnsubscribeToken(leadId, token)) {
      await updateLead(leadId, {
        unsubscribed: true,
        status: 'dead',
        last_action: 'Unsubscribed via email link',
      });
      await addEvent(leadId, 'Reply Handler Agent', 'unsubscribed', {});
    }
  } catch (error) {
    console.warn('Unsubscribe failed:', error.message);
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Διαγραφή</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#222;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.08);text-align:center;max-width:420px;">
      <h2 style="margin:0 0 10px;">Διαγραφήκατε</h2>
      <p style="margin:0;color:#666;">Δεν θα λάβετε άλλα email από εμάς. Καλή συνέχεια!</p>
    </div>
  </body></html>`);
});

app.post('/unsubscribe', async (req, res) => {
  const leadId = req.query.lead || (req.body && req.body.lead);
  const token = req.query.t || (req.body && req.body.t);
  try {
    if (leadId && verifyUnsubscribeToken(leadId, token)) {
      await updateLead(leadId, { unsubscribed: true, status: 'dead', last_action: 'Unsubscribed (one-click)' });
      await addEvent(leadId, 'Reply Handler Agent', 'unsubscribed', {});
    }
  } catch (error) {
    console.warn('Unsubscribe failed:', error.message);
  }
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

app.listen(port, () => {
  console.log(`LeadFlow dashboard running on http://localhost:${port}`);
  startScheduler();
  startKeepAlive();
});
