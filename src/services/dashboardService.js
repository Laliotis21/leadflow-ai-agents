const { listLeads, listEvents } = require('../lib/leadsRepo');
const { supabase, isSupabaseConfigured } = require('../lib/supabase');

// Accurate email counts straight from the outreach_logs table, split by step.
// step 1 = first (cold) email, steps 2/3 = follow-ups.
async function getEmailBreakdown() {
  const empty = { firstEmails: 0, followupEmails: 0, totalEmails: 0 };
  if (!isSupabaseConfigured || !supabase) return empty;

  try {
    const { data, error } = await supabase
      .from('outreach_logs')
      .select('step')
      .eq('status', 'sent');

    if (error || !data) return empty;

    let firstEmails = 0;
    let followupEmails = 0;
    for (const row of data) {
      if (Number(row.step) <= 1) firstEmails += 1;
      else followupEmails += 1;
    }
    return { firstEmails, followupEmails, totalEmails: firstEmails + followupEmails };
  } catch (err) {
    console.warn('[Dashboard] email breakdown failed:', err.message);
    return empty;
  }
}

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
  const emailBreakdown = await getEmailBreakdown();

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const total = leads.length;
  const qualifiedCount = leads.filter((l) => l.status === 'qualified').length;
  const scannedCount = leads.filter((l) => l.status !== 'new').length;
  const scoredCount = leads.filter((l) => l.score > 0).length;
  const contactedCount = leads.filter((l) => (l.outreach_count || 0) > 0).length;
  const followupCount = leads.filter((l) => l.status === 'followup').length;
  const repliedCount = leads.filter((l) => l.status === 'replied').length;
  const disqualifiedCount = leads.filter((l) => l.status === 'disqualified' || l.status === 'dead').length;

  const { firstEmails, followupEmails, totalEmails } = emailBreakdown;

  // Reply rate = replies / companies contacted (real conversion per prospect).
  const replyRate = pct(repliedCount, contactedCount || 1);

  const stats = [
    { label: 'Επιχειρήσεις', value: String(total), trend: `${scannedCount} scanned` },
    { label: 'Qualified', value: String(qualifiedCount), trend: `${pct(qualifiedCount, total)}% of leads` },
    { label: '1α emails', value: String(firstEmails), trend: `${contactedCount} επιχειρήσεις` },
    { label: 'Follow-up emails', value: String(followupEmails), trend: `${followupCount} σε εξέλιξη` },
    { label: 'Απαντήσεις', value: String(repliedCount), trend: `${replyRate}% reply rate` },
    { label: 'Σύνολο emails', value: String(totalEmails), trend: `${firstEmails} + ${followupEmails} follow-up` },
  ];

  const agents = [
    { name: 'Discovery Agent', health: 'Online', success: pct(total, total || 1) || 100, note: `${total} businesses discovered` },
    { name: 'Scanner Agent', health: 'Online', success: pct(scannedCount, total), note: `Enriched ${scannedCount}/${total} businesses` },
    { name: 'Qualification Agent', health: 'Online', success: pct(qualifiedCount, qualifiedCount + disqualifiedCount), note: `${qualifiedCount} qualified · ${disqualifiedCount} disqualified` },
    { name: 'Outreach Agent', health: 'Online', success: pct(contactedCount, qualifiedCount || 1), note: `${firstEmails} πρώτα emails σε ${contactedCount} επιχειρήσεις` },
    { name: 'Follow-up Agent', health: followupCount > 0 ? 'Running' : 'Online', success: replyRate, note: `${followupEmails} follow-up emails · ${replyRate}% reply rate` },
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
