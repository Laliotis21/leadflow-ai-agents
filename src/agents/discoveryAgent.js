const { listLeads, insertLead, addEvent } = require('../lib/leadsRepo');
const { searchPlaces } = require('../services/googlePlacesService');

/**
 * Discovery Agent:
 * Queries Google Maps / Places API for businesses in target locations,
 * isolates those without a website (or only social profiles),
 * scores their initial opportunity, and saves them to Supabase.
 */
async function discoverBusinesses({
  city = 'Athens',
  category = 'Dentist',
  query = '',
  limit = 10,
  onlyWithoutWebsite = true,
} = {}) {
  // 1. Search Google Places (Live API or smart mock if key is not configured)
  const placesResult = await searchPlaces({
    query,
    city,
    category,
    limit,
  });

  const rawPlaces = placesResult.results || [];
  const existingLeads = await listLeads(1000);
  const existingKeys = new Set(
    existingLeads.map((l) => `${(l.company_name || '').toLowerCase()}::${(l.city || '').toLowerCase()}`)
  );

  const discovered = [];
  let skippedDuplicates = 0;
  let skippedWithWebsite = 0;

  for (const place of rawPlaces) {
    // Check if business has a standalone website
    const hasWebsite = place.website && place.website.trim().length > 0;
    const isSocialOnly = hasWebsite && /facebook\.com|instagram\.com|tiktok\.com|linkedin\.com/i.test(place.website);

    if (onlyWithoutWebsite && hasWebsite && !isSocialOnly) {
      skippedWithWebsite += 1;
      continue;
    }

    // Deduplication check
    const dedupKey = `${place.companyName.toLowerCase()}::${city.toLowerCase()}`;
    if (existingKeys.has(dedupKey)) {
      skippedDuplicates += 1;
      continue;
    }

    // Extract social links if the website was actually a social link
    const socialLinks = [];
    if (isSocialOnly) {
      socialLinks.push(place.website);
    }

    // Generate estimated business email if not known
    const cleanName = place.companyName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove Greek accents
      .replace(/[^a-z0-9]/g, '');
    const estimatedEmail = `contact@${cleanName || 'business'}.gr`;

    // Compute initial discovery score (0.50 - 0.95)
    // Factors: has phone (+0.15), has reviews (>10: +0.10, >30: +0.15), high rating (>=4.5: +0.10), operational (+0.10)
    let score = 0.50;
    if (place.phone) score += 0.15;
    if (place.userRatingCount >= 30) score += 0.15;
    else if (place.userRatingCount >= 10) score += 0.10;
    if (place.rating && place.rating >= 4.5) score += 0.10;
    if (place.businessStatus === 'OPERATIONAL') score += 0.10;
    score = Math.min(0.95, Number(score.toFixed(2)));

    const leadRecord = {
      company_name: place.companyName,
      category: place.category || category || 'Business',
      city: place.city || city,
      address: place.address || `${city}, Greece`,
      phone: place.phone || null,
      website: isSocialOnly ? null : (place.website || null),
      email: estimatedEmail,
      social_links: socialLinks,
      score,
      status: 'new',
      source: 'google-maps',
      last_action: `Discovered on Google Maps (${place.userRatingCount || 0} reviews, ★${place.rating || 'N/A'})`,
      outreach_count: 0,
    };

    try {
      const inserted = await insertLead(leadRecord);
      if (inserted) {
        existingKeys.add(dedupKey);
        await addEvent(inserted.id, 'Discovery Agent', 'discovered', {
          source: 'google-maps',
          city,
          category: leadRecord.category,
          rating: place.rating,
          reviewCount: place.userRatingCount,
          apiMode: placesResult.mode,
        });
        discovered.push(inserted);
      }
    } catch (err) {
      console.warn(`[Discovery Agent] Error inserting lead ${place.companyName}:`, err.message);
    }
  }

  return {
    ok: true,
    mode: placesResult.mode,
    warning: placesResult.warning || null,
    city,
    category,
    totalFound: rawPlaces.length,
    withoutWebsite: rawPlaces.length - skippedWithWebsite,
    insertedCount: discovered.length,
    skippedDuplicates,
    skippedWithWebsite,
    businesses: discovered,
  };
}

module.exports = {
  discoverBusinesses,
};
