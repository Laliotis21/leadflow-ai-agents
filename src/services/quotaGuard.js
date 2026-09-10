const { supabase, isSupabaseConfigured } = require('../lib/supabase');

// Strict default limits to protect against ANY accidental billing
const MONTHLY_LIMIT = parseInt(process.env.GOOGLE_MAPS_MONTHLY_LIMIT || '1000', 10);
const DAILY_LIMIT = parseInt(process.env.GOOGLE_MAPS_DAILY_LIMIT || '50', 10);

// In-memory cache to prevent duplicate queries within 7 days (0 API cost)
const queryCache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Local memory fallback if Supabase is offline
let localMonthlyCount = 0;
let localDailyCount = 0;
let lastResetDate = new Date().toISOString().slice(0, 10);
let lastResetMonth = new Date().toISOString().slice(0, 7);

function checkLocalReset() {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = new Date().toISOString().slice(0, 7);

  if (today !== lastResetDate) {
    localDailyCount = 0;
    lastResetDate = today;
  }
  if (thisMonth !== lastResetMonth) {
    localMonthlyCount = 0;
    lastResetMonth = thisMonth;
  }
}

// Short-lived cache so frequent health/dashboard pings don't hit Supabase
// on every call. Invalidated whenever a live request is recorded.
const STATS_TTL_MS = 10 * 1000;
const statsCache = new Map(); // provider -> { at, data }

function invalidateStatsCache(provider) {
  if (provider) statsCache.delete(provider);
  else statsCache.clear();
}

/**
 * Get current usage statistics for Google Maps (or other providers)
 */
async function getUsageStats(provider = 'google_maps') {
  const cached = statsCache.get(provider);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) {
    return cached.data;
  }

  checkLocalReset();

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  let monthlyCount = localMonthlyCount;
  let dailyCount = localDailyCount;

  if (isSupabaseConfigured && supabase) {
    try {
      // Count live API calls this month (exclude cached calls)
      const { count: monthTotal, error: mErr } = await supabase
        .from('api_usage')
        .select('*', { count: 'exact', head: true })
        .eq('provider', provider)
        .eq('is_cached', false)
        .gte('created_at', startOfMonth);

      if (!mErr && typeof monthTotal === 'number') {
        monthlyCount = monthTotal;
      }

      // Count live API calls today
      const { count: dayTotal, error: dErr } = await supabase
        .from('api_usage')
        .select('*', { count: 'exact', head: true })
        .eq('provider', provider)
        .eq('is_cached', false)
        .gte('created_at', startOfDay);

      if (!dErr && typeof dayTotal === 'number') {
        dailyCount = dayTotal;
      }
    } catch (err) {
      console.warn('[QuotaGuard] Error fetching usage from Supabase:', err.message);
    }
  }

  const isMonthlyExceeded = monthlyCount >= MONTHLY_LIMIT;
  const isDailyExceeded = dailyCount >= DAILY_LIMIT;
  const isBlocked = isMonthlyExceeded || isDailyExceeded;

  let blockReason = null;
  if (isMonthlyExceeded) {
    blockReason = `Monthly free limit reached (${monthlyCount}/${MONTHLY_LIMIT} requests). Further calls blocked to avoid billing.`;
  } else if (isDailyExceeded) {
    blockReason = `Daily safety limit reached (${dailyCount}/${DAILY_LIMIT} requests). Further calls paused until tomorrow.`;
  }

  const result = {
    provider,
    monthlyCount,
    monthlyLimit: MONTHLY_LIMIT,
    remainingMonth: Math.max(0, MONTHLY_LIMIT - monthlyCount),
    dailyCount,
    dailyLimit: DAILY_LIMIT,
    remainingDay: Math.max(0, DAILY_LIMIT - dailyCount),
    isBlocked,
    blockReason,
    cacheEntriesCount: queryCache.size,
    estimatedCostEur: '0.00 €',
  };

  statsCache.set(provider, { at: Date.now(), data: result });
  return result;
}

/**
 * Checks if a live API request is permitted under free limits
 */
async function canMakeLiveRequest(provider = 'google_maps') {
  const stats = await getUsageStats(provider);
  return {
    allowed: !stats.isBlocked,
    reason: stats.blockReason,
    stats,
  };
}

/**
 * Record an API event (whether live, cached, or blocked)
 */
async function recordUsage({
  provider = 'google_maps',
  endpoint = 'places:searchText',
  queryParams = {},
  isCached = false,
  status = 'success',
}) {
  checkLocalReset();

  if (!isCached && status === 'success') {
    localDailyCount += 1;
    localMonthlyCount += 1;
  }
  invalidateStatsCache(provider);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('api_usage').insert({
        provider,
        endpoint,
        query_params: queryParams,
        is_cached: isCached,
        status,
        cost_eur: 0.00,
      });
    } catch (err) {
      console.warn('[QuotaGuard] Error recording usage into Supabase:', err.message);
    }
  }
}

/**
 * Cache helpers to avoid duplicate calls for identical city & category.
 * Backed by Supabase (`public.search_cache`) so entries survive restarts on
 * free hosts, with an in-memory layer as a fast path and offline fallback.
 */
async function getFromCache(key) {
  // Fast path: in-memory
  const item = queryCache.get(key);
  if (item) {
    if (Date.now() - item.timestamp > CACHE_TTL_MS) {
      queryCache.delete(key);
    } else {
      return item.data;
    }
  }

  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('search_cache')
      .select('payload, created_at')
      .eq('cache_key', key)
      .maybeSingle();

    if (error || !data) return null;

    if (Date.now() - new Date(data.created_at).getTime() > CACHE_TTL_MS) {
      return null; // stale; a fresh search will overwrite it
    }

    // Warm the in-memory layer for subsequent hits this session
    queryCache.set(key, { timestamp: new Date(data.created_at).getTime(), data: data.payload });
    return data.payload;
  } catch (err) {
    console.warn('[QuotaGuard] cache read failed:', err.message);
    return null;
  }
}

async function setToCache(key, data) {
  queryCache.set(key, { timestamp: Date.now(), data });

  if (!isSupabaseConfigured || !supabase) return;

  try {
    await supabase
      .from('search_cache')
      .upsert(
        { cache_key: key, payload: data, created_at: new Date().toISOString() },
        { onConflict: 'cache_key' }
      );
  } catch (err) {
    console.warn('[QuotaGuard] cache write failed:', err.message);
  }
}

module.exports = {
  MONTHLY_LIMIT,
  DAILY_LIMIT,
  getUsageStats,
  canMakeLiveRequest,
  recordUsage,
  getFromCache,
  setToCache,
};
