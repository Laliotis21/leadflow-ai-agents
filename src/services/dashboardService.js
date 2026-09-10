const { listLeads, listEvents } = require('../lib/leadsRepo');

function humanizeEventType(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

async function buildDashboardOverview() {
  const leads = await listLeads(200);
  const events = await listEvents(30);

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const total = leads.length;
  const qualifiedCount = leads.filter((l) => l.status === 'qualified').length;
  const scannedCount = leads.filter((l) => l.status !== 'new').length;
  const scoredCount = leads.filter((l) => l.score > 0).length;
  const emailedCount = leads.filter((l) => (l.outreach_count || 0) > 0).length;
  const followupCount = leads.filter((l) => l.status === 'followup').length;
  const repliedCount = leads.filter((l) => l.status === 'replied').length;
  const disqualifiedCount = leads.filter((l) => l.status === 'disqualified' || l.status === 'dead').length;

  // Reply rate = replies / emails sent (real conversion signal).
  const replyRate = pct(repliedCount, emailedCount);

  const stats = [
    { label: 'Total discovered', value: String(total), trend: `${scannedCount} scanned` },
    { label: 'Qualified', value: String(qualifiedCount), trend: `${pct(qualifiedCount, total)}% of leads` },
    { label: 'Emails sent', value: String(emailedCount), trend: `${followupCount} in follow-up` },
    { label: 'Replies', value: String(repliedCount), trend: `${replyRate}% reply rate` },
  ];

  const agents = [
    { name: 'Discovery Agent', health: 'Online', success: pct(total, total || 1) || 100, note: `${total} businesses discovered` },
    { name: 'Scanner Agent', health: 'Online', success: pct(scannedCount, total), note: `Enriched ${scannedCount}/${total} businesses` },
    { name: 'Qualification Agent', health: 'Online', success: pct(qualifiedCount, qualifiedCount + disqualifiedCount), note: `${qualifiedCount} qualified · ${disqualifiedCount} disqualified` },
    { name: 'Outreach Agent', health: 'Online', success: pct(emailedCount, qualifiedCount || 1), note: `${emailedCount} outbound emails sent` },
    { name: 'Follow-up Agent', health: followupCount > 0 ? 'Running' : 'Online', success: replyRate, note: `${followupCount} leads in nurture · ${replyRate}% reply rate` },
  ];

  const activity = events.map((event) => {
    const lead = leadById.get(event.lead_id);
    return {
      id: event.id,
      agent: event.agent_name,
      type: event.type,
      title: humanizeEventType(event.type),
      company: lead ? lead.company_name : null,
      createdAt: event.created_at,
      payload: event.payload || {},
    };
  });

  return {
    stats,
    agents,
    leads: leads.map((lead) => ({
      id: lead.id,
      company: lead.company_name,
      category: lead.category,
      location: `${lead.city || ''}`,
      score: `${Math.round((lead.score || 0) * 100)}%`,
      status: lead.status,
      lastAction: lead.last_action,
      email: lead.email,
      createdAt: lead.created_at,
    })),
    recentEvents: activity,
  };
}

module.exports = {
  buildDashboardOverview,
};
