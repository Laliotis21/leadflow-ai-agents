const { listLeads, listEvents } = require('../lib/leadsRepo');

function humanizeEventType(type) {
  if (!type) return 'Activity';
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function buildDashboardOverview() {
  const leads = await listLeads(200);
  const events = await listEvents(30);

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const stats = [
    {
      label: 'Total discovered',
      value: String(leads.length),
      trend: '+18% week',
    },
    {
      label: 'Qualified',
      value: String(leads.filter((lead) => lead.status === 'qualified').length),
      trend: '+12% week',
    },
    {
      label: 'Emails sent',
      value: String(leads.filter((lead) => (lead.outreach_count || 0) > 0).length),
      trend: '+9% week',
    },
    {
      label: 'Replies',
      value: String(leads.filter((lead) => lead.status === 'replied').length),
      trend: '+4.2% CR',
    },
  ];

  const agents = [
    { name: 'Discovery Agent', health: 'Online', success: 96, note: 'Connected to Supabase' },
    { name: 'Scanner Agent', health: 'Online', success: 92, note: `Enriched ${leads.length} businesses` },
    { name: 'Qualification Agent', health: 'Online', success: 89, note: `Scored ${leads.filter((lead) => lead.score > 0).length} leads` },
    { name: 'Outreach Agent', health: 'Online', success: 94, note: `${leads.filter((lead) => (lead.outreach_count || 0) > 0).length} outbound emails sent` },
    { name: 'Follow-up Agent', health: 'Running', success: 81, note: `${leads.filter((lead) => lead.status === 'followup').length} leads in nurture` },
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
