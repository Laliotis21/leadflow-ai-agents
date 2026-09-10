const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');

async function runFollowUps() {
  const leads = await listLeads(500);

  let followups = 0;

  for (const lead of leads) {
    if (lead.status !== 'replied' && lead.status !== 'dead' && (lead.outreach_count || 0) > 0) {
      const nextAttempt = (lead.outreach_count || 0) + 1;

      await updateLead(lead.id, {
        status: 'followup',
        outreach_count: nextAttempt,
        last_action: `Follow-up #${nextAttempt} queued`,
      });

      await addEvent(lead.id, 'Follow-up Agent', 'followup_queued', {
        attempt: nextAttempt,
      });

      followups += 1;
    }
  }

  return {
    ok: true,
    followUpsQueued: followups,
  };
}

module.exports = {
  runFollowUps,
};
