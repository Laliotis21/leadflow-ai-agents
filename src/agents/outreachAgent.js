const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');
const { sendEmail, getEmailUsage } = require('../services/emailService');
const { buildColdEmail } = require('../services/emailTemplates');

function isRealEmail(email) {
  if (!email) return false;
  // Skip the auto-generated placeholder emails from discovery (contact@name.gr)
  if (email.startsWith('contact@')) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function sendOutreach() {
  const leads = await listLeads(500);
  const usage = await getEmailUsage();

  let sent = 0;
  let skipped = 0;
  let blocked = 0;
  let failed = 0;
  const details = [];

  for (const lead of leads) {
    if (lead.status !== 'qualified') continue;

    if (lead.unsubscribed) {
      skipped += 1;
      details.push({ company: lead.company_name, result: 'skipped_unsubscribed' });
      continue;
    }

    if (!isRealEmail(lead.email)) {
      skipped += 1;
      details.push({ company: lead.company_name, result: 'skipped_no_valid_email' });
      continue;
    }

    const { subject, text, html, template } = buildColdEmail(lead, 1);
    const result = await sendEmail({
      leadId: lead.id,
      to: lead.email,
      subject,
      html,
      text,
      template,
      step: 1,
    });

    if (result.blocked) {
      blocked += 1;
      details.push({ company: lead.company_name, result: 'rate_limited' });
      break; // stop early to respect free-tier limits
    }

    if (!result.ok) {
      failed += 1;
      details.push({ company: lead.company_name, result: 'failed', error: result.error });
      continue;
    }

    await updateLead(lead.id, {
      outreach_count: (lead.outreach_count || 0) + 1,
      status: 'outreach',
      last_outreach_at: new Date().toISOString(),
      last_action: result.simulated
        ? 'Outreach simulated (no Resend key)'
        : `Outreach email sent${result.redirected ? ' (test redirect)' : ''}`,
    });

    await addEvent(lead.id, 'Outreach Agent', 'email_sent', {
      template,
      simulated: !!result.simulated,
      messageId: result.messageId || null,
      sentAt: new Date().toISOString(),
    });

    sent += 1;
    details.push({ company: lead.company_name, result: result.simulated ? 'simulated' : 'sent' });
  }

  return {
    ok: true,
    emailsSent: sent,
    skipped,
    blocked,
    failed,
    usage,
    details,
  };
}

module.exports = {
  sendOutreach,
};
