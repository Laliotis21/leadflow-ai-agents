const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');

const IMAP_CONFIG = {
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASS,
  host: process.env.IMAP_HOST,
  port: Number(process.env.IMAP_PORT || '993'),
  tls: String(process.env.IMAP_TLS || 'true').toLowerCase() !== 'false',
  tlsOptions: {
    rejectUnauthorized: false,
  },
};

function isImapConfigured() {
  return !!(IMAP_CONFIG.host && IMAP_CONFIG.user && IMAP_CONFIG.password);
}

function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

function extractSenderEmail(fromValue) {
  if (!fromValue) return null;

  if (Array.isArray(fromValue)) {
    const first = fromValue[0];
    return first?.address || first?.value?.[0]?.address || null;
  }

  if (typeof fromValue === 'string') {
    return fromValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  }

  if (fromValue.value && Array.isArray(fromValue.value)) {
    return fromValue.value[0]?.address || null;
  }

  return null;
}

function buildReplySummary(parsed) {
  const rawText = parsed?.text || parsed?.html || '';
  return String(rawText).replace(/\s+/g, ' ').trim().slice(0, 280);
}

async function connectImap() {
  return new Promise((resolve, reject) => {
    const client = new Imap(IMAP_CONFIG);

    client.once('ready', () => resolve(client));
    client.once('error', (error) => reject(error));
    client.once('end', () => {});

    client.connect();
  });
}

async function fetchNewReplies() {
  const client = await connectImap();

  try {
    await new Promise((resolve, reject) => {
      client.openBox('INBOX', false, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    const searchResults = await new Promise((resolve, reject) => {
      client.search(['UNSEEN'], (error, results) => {
        if (error) return reject(error);
        resolve(results || []);
      });
    });

    if (!searchResults.length) {
      return { configured: true, checked: true, newReplies: 0, updated: 0, details: [] };
    }

    const parsedMessages = await new Promise((resolve, reject) => {
      const parsedPromises = [];
      const fetch = client.fetch(searchResults, { bodies: '' });

      fetch.on('message', (msg) => {
        parsedPromises.push(
          new Promise((done, fail) => {
            msg.on('body', (stream) => {
              simpleParser(stream)
                .then((parsed) => done(parsed))
                .catch(fail);
            });
            msg.once('error', fail);
          })
        );
      });

      fetch.once('error', reject);
      fetch.once('end', async () => {
        try {
          resolve(await Promise.all(parsedPromises));
        } catch (error) {
          reject(error);
        }
      });
    });

    const leads = await listLeads(500);
    const leadsByEmail = new Map();

    for (const lead of leads) {
      if (lead.email) {
        leadsByEmail.set(normalizeEmail(lead.email), lead);
      }
    }

    const updated = [];

    for (const parsed of parsedMessages) {
      const senderEmail = extractSenderEmail(parsed?.from);
      if (!senderEmail) continue;

      const lead = leadsByEmail.get(normalizeEmail(senderEmail));
      if (!lead) continue;
      if (lead.status === 'replied' || lead.status === 'dead') continue;

      await updateLead(lead.id, {
        status: 'replied',
        last_action: 'Prospect replied via IMAP',
      });

      await addEvent(lead.id, 'Reply Handler Agent', 'reply_received', {
        source: 'imap',
        sender_email: senderEmail,
        subject: parsed?.subject || '',
        snippet: buildReplySummary(parsed),
      });

      updated.push({
        leadId: lead.id,
        company: lead.company_name,
        senderEmail,
        subject: parsed?.subject || '',
      });
    }

    await new Promise((resolve, reject) => {
      client.addFlags(searchResults, '\\Seen', (error) => {
        if (error) return reject(error);
        resolve();
      });
    });

    return {
      configured: true,
      checked: true,
      newReplies: updated.length,
      updated,
    };
  } finally {
    client.end();
  }
}

async function checkInboxForReplies() {
  if (!isImapConfigured()) {
    return {
      ok: false,
      configured: false,
      checked: false,
      reason: 'missing_imap_config',
    };
  }

  try {
    const result = await fetchNewReplies();
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      checked: true,
      error: error.message,
    };
  }
}

module.exports = {
  isImapConfigured,
  checkInboxForReplies,
};
