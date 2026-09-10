const { supabase, isSupabaseConfigured } = require('./supabase');

async function listLeads(limit = 50) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listLeads failed: ${error.message}`);
  }

  return data || [];
}

async function insertLead(lead) {
  const { data, error } = await supabase
    .from('leads')
    .insert(lead)
    .select()
    .single();

  if (error) {
    // Unique-violation means the lead already exists; treat as skip.
    if (error.code === '23505') {
      return null;
    }
    throw new Error(`insertLead failed: ${error.message}`);
  }

  return data;
}

async function updateLead(id, updates) {
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`updateLead failed: ${error.message}`);
  }

  return data;
}

// Atomically transition a lead only if it is still in the expected status.
// Returns the updated row, or null if another worker already claimed it.
async function claimLead(id, fromStatus, updates) {
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .eq('status', fromStatus)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`claimLead failed: ${error.message}`);
  }

  return data || null;
}

async function addEvent(leadId, agentName, type, payload = {}) {
  const { error } = await supabase.from('events').insert({
    lead_id: leadId,
    agent_name: agentName,
    type,
    payload,
  });

  if (error) {
    throw new Error(`addEvent failed: ${error.message}`);
  }
}

async function listEvents(limit = 8) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listEvents failed: ${error.message}`);
  }

  return data || [];
}

module.exports = {
  isSupabaseConfigured,
  listLeads,
  insertLead,
  updateLead,
  claimLead,
  addEvent,
  listEvents,
};
