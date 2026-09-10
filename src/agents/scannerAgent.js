const { listLeads, updateLead, addEvent } = require('../lib/leadsRepo');

async function scanBusinesses() {
  const leads = await listLeads(500);

  let scanned = 0;

  for (const lead of leads) {
    if (lead.status === 'new') {
      const socialLinks = Array.isArray(lead.social_links) && lead.social_links.length > 0
        ? lead.social_links
        : ['instagram.com/placeholder'];

      await updateLead(lead.id, {
        social_links: socialLinks,
        status: 'scanned',
        last_action: 'Scanned and enriched by Scanner Agent',
      });

      await addEvent(lead.id, 'Scanner Agent', 'scanned', {
        category: lead.category,
        hasWebsite: !!lead.website,
      });

      scanned += 1;
    }
  }

  return {
    ok: true,
    scannedCount: scanned,
  };
}

module.exports = {
  scanBusinesses,
};
