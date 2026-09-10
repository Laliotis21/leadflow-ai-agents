const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');
const { sendEmail, getEmailUsage } = require('../services/emailService');
const { buildColdEmail } = require('../services/emailTemplates');

const MAX_STEPS = 3; // step 1 = initial outreach, steps 2 & 3 = follow-ups
const FOLLOWUP_DELAY_MS = Number(process.env.FOLLOWUP_DELAY_MS) || 3 * 24 * 60 * 60 * 1000; // 3 days

function isRealEmail(email) {
  if (!email) return false;
  if (email.startsWith('contact@')) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function isDueForFollowUp(lead) {
  if (!lead.last_outreach_at) return true;
  return Date.now() - new Date(lead.last_outreach_at).getTime() >= FOLLOWUP_DELAY_MS;
}

async function runFollowUps() {
  const leads = await listLeads(500);

  let sent = 0;
  let skipped = 0;
  let blocked = 0;
  let failed = 0;
  let exhausted = 0;
  const details = [];

  for (const lead of leads) {
    // Only leads already in the outreach cycle qualify for follow-ups.
    if (lead.status !== 'outreach' && lead.status !== 'followup') continue;

    const currentStep = lead.outreach_count || 0;

    // Already sent all steps: close out the sequence once.
    if (currentStep >= MAX_STEPS) {
      await updateLead(lead.id, {
        status: 'dead',
        last_action: 'Follow-up sequence completed (no reply)',
      });
      await addEvent(lead.id, 'Follow-up Agent', 'sequence_completed', { steps: currentStep });
      exhausted += 1;
      details.push({ company: lead.company_name, result: 'sequence_completed' });
      continue;
    }

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

    if (!isDueForFollowUp(lead)) {
      skipped += 1;
      details.push({ company: lead.company_name, result: 'not_due_yet' });
      continue;
    }

    const nextStep = currentStep + 1; // 2 or 3
    const { subject, text, html, template } = buildColdEmail(lead, nextStep);
    const result = await sendEmail({
      leadId: lead.id,
      to: lead.email,
      subject,
      html,
      text,
      template,
      step: nextStep,
    });

    if (result.blocked) {
      blocked += 1;
      details.push({ company: lead.company_name, result: 'rate_limited' });
      break; // respect free-tier limits
    }

    if (!result.ok) {
      failed += 1;
      details.push({ company: lead.company_name, result: 'failed', error: result.error });
      continue;
    }

    await updateLead(lead.id, {
      status: 'followup',
      outreach_count: nextStep,
      last_outreach_at: new Date().toISOString(),
      last_action: result.simulated
        ? `Follow-up #${nextStep} simulated (no Resend key)`
        : `Follow-up #${nextStep} email sent${result.redirected ? ' (test redirect)' : ''}`,
    });

    await addEvent(lead.id, 'Follow-up Agent', 'followup_sent', {
      step: nextStep,
      template,
      simulated: !!result.simulated,
      messageId: result.messageId || null,
      sentAt: new Date().toISOString(),
    });

    sent += 1;
    details.push({ company: lead.company_name, result: result.simulated ? 'simulated' : 'sent', step: nextStep });
  }

  return {
    ok: true,
    followUpsSent: sent,
    skipped,
    blocked,
    failed,
    exhausted,
    usage: await getEmailUsage(),
    details,
  };
}

module.exports = {
  runFollowUps,
};
