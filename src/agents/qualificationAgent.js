const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');

async function qualifyBusinesses() {
  const leads = await listLeads(500);

  let qualified = 0;

  for (const lead of leads) {
    if (lead.status === 'new' || lead.status === 'scanned') {
      const score = Math.min(0.99, Number((lead.score || 0.5) + 0.08));
      const status = score >= 0.75 ? 'qualified' : 'new';

      await updateLead(lead.id, {
        score,
        status,
        last_action: status === 'qualified' ? 'Qualified by Qualification Agent' : 'Needs manual review',
      });

      await addEvent(lead.id, 'Qualification Agent', 'qualified', { score });

      if (status === 'qualified') {
        qualified += 1;
      }
    }
  }

  return {
    ok: true,
    qualifiedCount: qualified,
  };
}

module.exports = {
  qualifyBusinesses,
};
