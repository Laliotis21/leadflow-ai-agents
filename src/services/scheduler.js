const { scanBusinesses } = require('../agents/scannerAgent');
const { qualifyBusinesses } = require('../agents/qualificationAgent');
const { sendOutreach } = require('../agents/outreachAgent');
const { runFollowUps } = require('../agents/followupAgent');
const { checkInboxForReplies } = require('./imapReplyService');

// In-process 24/7 automation. Runs the lead pipeline on a fixed interval
// inside the same Node process that serves the dashboard + API.
// Discovery is intentionally NOT auto-run to protect the Google Maps budget;
// trigger it manually from the dashboard when you want fresh leads.

const PIPELINE_INTERVAL_MS = Number(process.env.PIPELINE_INTERVAL_MS) || 30 * 60 * 1000; // default 30 min
const AUTOMATION_ENABLED = String(process.env.AUTOMATION_ENABLED || 'true').toLowerCase() !== 'false';

let timer = null;
let isRunning = false;
let lastRunAt = null;
let lastResult = null;
let lastError = null;
let runCount = 0;

async function runPipelineOnce() {
  if (isRunning) return { skipped: true, reason: 'already_running' };

  isRunning = true;
  const startedAt = new Date();
  const steps = {};

  try {
    steps.scan = await safeStep(scanBusinesses);
    steps.qualify = await safeStep(qualifyBusinesses);
    steps.outreach = await safeStep(sendOutreach);
    steps.followup = await safeStep(runFollowUps);
    steps.replyCheck = await safeStep(checkInboxForReplies);

    lastError = null;
    lastResult = { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), steps };
    runCount += 1;
    lastRunAt = new Date();
    return lastResult;
  } catch (error) {
    lastError = error.message;
    return { ok: false, error: error.message };
  } finally {
    isRunning = false;
  }
}

async function safeStep(fn) {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (error) {
    console.error(`[scheduler] step ${fn.name} failed:`, error.message);
    return { ok: false, error: error.message };
  }
}

function startScheduler() {
  if (!AUTOMATION_ENABLED) {
    console.log('[scheduler] automation disabled (AUTOMATION_ENABLED=false)');
    return;
  }
  if (timer) return;

  console.log(`[scheduler] starting pipeline every ${Math.round(PIPELINE_INTERVAL_MS / 60000)} min`);
  // Kick off shortly after boot, then on the interval.
  setTimeout(() => {
    runPipelineOnce().catch((e) => console.error('[scheduler] first run failed:', e.message));
  }, 15 * 1000);

  timer = setInterval(() => {
    runPipelineOnce().catch((e) => console.error('[scheduler] run failed:', e.message));
  }, PIPELINE_INTERVAL_MS);

  if (timer.unref) timer.unref();
}

function getSchedulerStatus() {
  return {
    enabled: AUTOMATION_ENABLED,
    intervalMinutes: Math.round(PIPELINE_INTERVAL_MS / 60000),
    isRunning,
    runCount,
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    lastError,
    lastResult,
  };
}

module.exports = { startScheduler, runPipelineOnce, getSchedulerStatus };
