const state = {
  leads: [
    {
      id: 'lead-1',
      companyName: 'The Bloom Studio',
      category: 'Salon',
      city: 'Athens',
      address: 'Kolonaki, Athens',
      phone: '+30 210 123 4567',
      website: null,
      socialLinks: ['instagram.com/thebloomstudio'],
      score: 0.87,
      status: 'qualified',
      lastAction: 'Opened by Outreach Agent',
      outreachCount: 1,
      email: 'hello@thebloomstudio.gr',
      source: 'google-maps',
      discoveredAt: new Date().toISOString(),
    },
    {
      id: 'lead-2',
      companyName: 'CityCare Dental',
      category: 'Clinic',
      city: 'Patras',
      address: 'Patras Center',
      phone: '+30 2610 987 654',
      website: 'https://citycaredental.gr',
      socialLinks: ['facebook.com/citycaredental'],
      score: 0.94,
      status: 'replied',
      lastAction: 'Prospect replied positively',
      outreachCount: 1,
      email: 'info@citycaredental.gr',
      source: 'google-maps',
      discoveredAt: new Date().toISOString(),
    },
    {
      id: 'lead-3',
      companyName: 'North Peak Cafe',
      category: 'Restaurant',
      city: 'Thessaloniki',
      address: 'Sofouli 18',
      phone: '+30 2310 555 123',
      website: null,
      socialLinks: ['instagram.com/northpeakcafe'],
      score: 0.79,
      status: 'followup',
      lastAction: 'Follow-up #2 queued',
      outreachCount: 2,
      email: 'info@northpeakcafe.gr',
      source: 'google-maps',
      discoveredAt: new Date().toISOString(),
    },
    {
      id: 'lead-4',
      companyName: 'Metro Auto Center',
      category: 'Auto Service',
      city: 'Larissa',
      address: 'Karditsa Road 6',
      phone: '+30 2410 432 112',
      website: null,
      socialLinks: [],
      score: 0.83,
      status: 'new',
      lastAction: 'Discovered 2h ago',
      outreachCount: 0,
      email: 'sales@metroautocenter.gr',
      source: 'google-maps',
      discoveredAt: new Date().toISOString(),
    },
    {
      id: 'lead-5',
      companyName: 'Harbor Law Office',
      category: 'Legal',
      city: 'Heraklion',
      address: 'Akti Melenou',
      phone: '+30 2810 999 555',
      website: null,
      socialLinks: ['facebook.com/harborlaw'],
      score: 0.69,
      status: 'new',
      lastAction: 'Scanner pending',
      outreachCount: 0,
      email: 'office@harborlaw.gr',
      source: 'google-maps',
      discoveredAt: new Date().toISOString(),
    }
  ],

  events: [
    {
      id: 'evt-1',
      leadId: 'lead-1',
      agentName: 'Discovery Agent',
      type: 'discovered',
      payload: { source: 'google-maps', city: 'Athens' },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'evt-2',
      leadId: 'lead-1',
      agentName: 'Qualification Agent',
      type: 'qualified',
      payload: { score: 0.87 },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'evt-3',
      leadId: 'lead-2',
      agentName: 'Outreach Agent',
      type: 'email_sent',
      payload: { template: 'cold-email-v1' },
      createdAt: new Date().toISOString(),
    }
  ]
};

function addLead(lead) {
  state.leads.push(lead);
}

function addEvent(leadId, agentName, type, payload) {
  state.events.unshift({
    id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    leadId,
    agentName,
    type,
    payload,
    createdAt: new Date().toISOString(),
  });
}

function updateLead(leadId, updates) {
  const lead = state.leads.find((item) => item.id === leadId);

  if (!lead) {
    return null;
  }

  Object.assign(lead, updates);
  return lead;
}

function getState() {
  return state;
}

module.exports = {
  state,
  addLead,
  addEvent,
  updateLead,
  getState,
};
