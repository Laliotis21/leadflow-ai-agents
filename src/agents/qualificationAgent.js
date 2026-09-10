const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');

const QUALIFY_THRESHOLD = 0.75;

async function qualifyBusinesses() {
  const leads = await listLeads(500);

  let qualified = 0;
  let disqualified = 0;

  for (const lead of leads) {
    // Only leads that finished scanning are ready to qualify. This is a
    // terminal decision: each lead is scored exactly once and never re-enters.
    if (lead.status !== 'scanned') continue;

    const score = Math.min(0.99, Number((lead.score || 0.5) + 0.08));
    const isQualified = score >= QUALIFY_THRESHOLD;
    const status = isQualified ? 'qualified' : 'disqualified';

    await updateLead(lead.id, {
      score,
      status,
      last_action: isQualified
        ? 'Qualified by Qualification Agent'
        : `Disqualified (score ${(score * 100).toFixed(0)}% below threshold)`,
    });

    await addEvent(lead.id, 'Qualification Agent', isQualified ? 'qualified' : 'disqualified', { score });

    if (isQualified) qualified += 1;
    else disqualified += 1;
  }

  return {
    ok: true,
    qualifiedCount: qualified,
    disqualifiedCount: disqualified,
  };
}

module.exports = {
  qualifyBusinesses,
};
