const https = require('https');
const {
  canMakeLiveRequest,
  recordUsage,
  getFromCache,
  setToCache,
} = require('./quotaGuard');

/**
 * Fetch helper using Node built-in https or fetch
 */
async function fetchJson(url, options = {}) {
  if (typeof fetch === 'function') {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Search businesses using Google Places API (Text Search / Nearby Search)
 * Strictly guarded by QuotaGuard to prevent any billable usage exceeding the 0€ limit.
 */
async function searchPlaces({
  query,
  city = 'Athens',
  category = '',
  limit = 10,
  apiKey = process.env.GOOGLE_MAPS_API_KEY,
}) {
  const searchQuery = query || `${category ? category + ' in ' : ''}${city}`;
  const cacheKey = `gmap::${city.toLowerCase()}::${category.toLowerCase()}::${searchQuery.toLowerCase()}`;

  // 1. Check Cache first (100% Free, 0 Google API requests)
  const cached = await getFromCache(cacheKey);
  if (cached) {
    await recordUsage({
      provider: 'google_maps',
      endpoint: 'cache:hit',
      queryParams: { city, category, query: searchQuery },
      isCached: true,
      status: 'success',
    });
    return {
      mode: 'cache',
      fromCache: true,
      results: cached.slice(0, limit),
    };
  }

  // 2. Fallback to realistic mock if no key
  if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
    return {
      mode: 'mock',
      warning: 'No GOOGLE_MAPS_API_KEY found. Using realistic simulated data.',
      results: generateMockPlaces(city, category, limit),
    };
  }

  // 3. HARD RATE LIMIT CHECK: Guarantee 0€ cost by checking budget
  const quota = await canMakeLiveRequest('google_maps');
  if (!quota.allowed) {
    console.warn(`[QuotaGuard] Live request blocked to prevent charges: ${quota.reason}`);
    await recordUsage({
      provider: 'google_maps',
      endpoint: 'places:blocked',
      queryParams: { city, category, query: searchQuery },
      isCached: false,
      status: 'rate_limited',
    });
    return {
      mode: 'blocked_quota',
      warning: quota.reason,
      results: generateMockPlaces(city, category, limit),
    };
  }

  // 4. Perform live request under protected quota
  try {
    const url = 'https://places.googleapis.com/v1/places:searchText';
    const places = [];
    let pageToken = null;

    // Each page is a separate billable request, so re-check quota per page
    // and page only until we have enough results or run out of pages.
    do {
      if (places.length > 0) {
        const pageQuota = await canMakeLiveRequest('google_maps');
        if (!pageQuota.allowed) break;
      }

      const body = {
        textQuery: searchQuery,
        pageSize: Math.min(limit - places.length, 20),
        languageCode: 'el',
      };
      if (pageToken) body.pageToken = pageToken;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'nextPageToken,places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.types,places.googleMapsUri,places.businessStatus',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (places.length > 0) break; // keep what we already have
        return await searchPlacesLegacy({ searchQuery, limit, apiKey, cacheKey, city, category });
      }

      const data = await response.json();
      for (const p of data.places || []) {
        places.push({
          placeId: p.id,
          companyName: p.displayName?.text || 'Unnamed Business',
          category: p.primaryType || (p.types && p.types[0]) || category || 'Business',
          city,
          address: p.formattedAddress || `${city}, Greece`,
          phone: p.nationalPhoneNumber || null,
          website: p.websiteUri || null,
          rating: p.rating || null,
          userRatingCount: p.userRatingCount || 0,
          googleMapsUri: p.googleMapsUri || null,
          businessStatus: p.businessStatus || 'OPERATIONAL',
          rawTypes: p.types || [],
        });
      }

      // Record each live page request in the Supabase usage tracker
      await recordUsage({
        provider: 'google_maps',
        endpoint: 'places.googleapis.com/v1/places:searchText',
        queryParams: { city, category, query: searchQuery, limit, page: pageToken ? 'next' : 'first' },
        isCached: false,
        status: 'success',
      });

      pageToken = data.nextPageToken || null;
    } while (pageToken && places.length < limit);

    const trimmed = places.slice(0, limit);

    // Cache results for 7 days so identical searches use 0 calls
    await setToCache(cacheKey, trimmed);

    return {
      mode: 'live',
      results: trimmed,
    };
  } catch (err) {
    console.warn(`[Google Places] Live API call failed (${err.message}). Falling back to legacy/mock.`);
    try {
      return await searchPlacesLegacy({ searchQuery, limit, apiKey, cacheKey, city, category });
    } catch (legacyErr) {
      console.warn(`[Google Places] Legacy API call also failed (${legacyErr.message}). Using simulated data.`);
      return {
        mode: 'mock',
        warning: `API Error: ${err.message}. Using simulated data.`,
        results: generateMockPlaces(city, category, limit),
      };
    }
  }
}

/**
 * Legacy Google Places Text Search endpoint fallback
 */
async function searchPlacesLegacy({ searchQuery, limit = 10, apiKey, cacheKey, city, category }) {
  const encodedQuery = encodeURIComponent(searchQuery);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodedQuery}&key=${apiKey}&language=el`;
  const data = await fetchJson(url);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places legacy API status: ${data.status} - ${data.error_message || ''}`);
  }

  const results = (data.results || []).slice(0, limit).map((p) => ({
    placeId: p.place_id,
    companyName: p.name,
    category: (p.types && p.types[0]) || 'Business',
    address: p.formatted_address || '',
    phone: null,
    website: null,
    rating: p.rating || null,
    userRatingCount: p.user_ratings_total || 0,
    businessStatus: p.business_status || 'OPERATIONAL',
    rawTypes: p.types || [],
  }));

  // Fetch Place Details for the top items to get website & phone
  const enriched = await Promise.all(
    results.map(async (place) => {
      try {
        const details = await fetchPlaceDetailsLegacy(place.placeId, apiKey);
        return {
          ...place,
          phone: details.formatted_phone_number || details.international_phone_number || null,
          website: details.website || null,
        };
      } catch {
        return place;
      }
    })
  );

  if (cacheKey) {
    await setToCache(cacheKey, enriched);
  }

  await recordUsage({
    provider: 'google_maps',
    endpoint: 'maps/api/place/textsearch',
    queryParams: { city, category, query: searchQuery },
    isCached: false,
    status: 'success',
  });

  return {
    mode: 'live',
    results: enriched,
  };
}

/**
 * Fetch detailed place info including website & phone (Legacy API)
 */
async function fetchPlaceDetailsLegacy(placeId, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,international_phone_number,website,url,opening_hours&key=${apiKey}&language=el`;
  const data = await fetchJson(url);
  return data.result || {};
}

/**
 * High-quality realistic mock data generator for offline testing
 */
function generateMockPlaces(city, category = 'Dentist', limit = 5) {
  const cat = category || 'Dentist';
  const slug = city.toLowerCase().replace(/\s+/g, '');

  const templates = [
    {
      nameSuffix: 'Studio',
      defaultCategory: 'Beauty & Hair Salon',
      hasPhone: true,
      hasWebsite: false,
      rating: 4.8,
      reviews: 42,
    },
    {
      nameSuffix: 'Care & Diagnostics',
      defaultCategory: 'Dental Clinic',
      hasPhone: true,
      hasWebsite: false,
      rating: 4.9,
      reviews: 68,
    },
    {
      nameSuffix: 'Specialized Auto Service',
      defaultCategory: 'Auto Repair',
      hasPhone: true,
      hasWebsite: false,
      rating: 4.6,
      reviews: 29,
    },
    {
      nameSuffix: 'Traditional Bakery & Cafe',
      defaultCategory: 'Bakery / Cafe',
      hasPhone: true,
      hasWebsite: false,
      rating: 4.7,
      reviews: 115,
    },
    {
      nameSuffix: 'Legal & Consulting Services',
      defaultCategory: 'Law Office',
      hasPhone: true,
      hasWebsite: false,
      rating: 5.0,
      reviews: 14,
    },
    {
      nameSuffix: 'Physiotherapy & Rehab',
      defaultCategory: 'Medical Practice',
      hasPhone: true,
      hasWebsite: false,
      rating: 4.9,
      reviews: 53,
    },
    {
      nameSuffix: 'Architects & Design',
      defaultCategory: 'Architecture Studio',
      hasPhone: true,
      hasWebsite: false,
      rating: 4.7,
      reviews: 19,
    },
  ];

  const streets = ['Ermou', 'Tsimiski', 'Mitropoleos', 'Panepistimiou', 'Kifisias', 'Agiou Andreou', 'Larisis'];

  return templates.slice(0, limit).map((t, idx) => {
    const name = `${city} ${t.nameSuffix} #${idx + 1}`;
    const street = streets[idx % streets.length];
    return {
      placeId: `mock-gmap-${slug}-${idx + 1}-${Date.now().toString(36)}`,
      companyName: name,
      category: cat || t.defaultCategory,
      city,
      address: `${street} ${12 + idx * 7}, ${city}, Greece`,
      phone: `+30 210 ${Math.floor(1000000 + Math.random() * 9000000)}`,
      website: t.hasWebsite ? `https://${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.gr` : null,
      rating: t.rating,
      userRatingCount: t.reviews,
      googleMapsUri: `https://maps.google.com/?q=${encodeURIComponent(name + ' ' + city)}`,
      businessStatus: 'OPERATIONAL',
      rawTypes: [t.defaultCategory.toLowerCase().replace(/\s+/g, '_')],
    };
  });
}

module.exports = {
  searchPlaces,
  searchPlacesLegacy,
  generateMockPlaces,
};
