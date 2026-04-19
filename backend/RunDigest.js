/**
 * Stage 5/6: full digest pipeline
 * collect -> OpenAI summarize (single batch) -> overwrite Summaries sheet.
 * Supports manual and scheduled runs with lock + cooldown protection.
 */

var RUN_DIGEST_CONFIG = Object.freeze({
  TIMEZONE: 'Asia/Qyzylorda',
  COOLDOWN_MINUTES: 30,
  LOCK_WAIT_MS: 5000,
});

function runDigestPipeline() {
  return runDigestCore({
    actor: 'manual',
    // Manual runs are intentionally unrestricted by cooldown.
    enforceCooldown: false,
  });
}


function manualRun() {
  return runDigestPipeline();
}

function runDigestCore(options) {
  options = options || {};
  var actor = safeTrim(options.actor || 'manual');
  var enforceCooldown = options.enforceCooldown !== false;

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(RUN_DIGEST_CONFIG.LOCK_WAIT_MS);
  if (!locked) {
    var lockErr = 'Another run is in progress. Try again in a few seconds.';
    setLastRunState({
      status: 'error',
      error: lockErr,
      groupsTotal: 0,
      itemsAfterDedupTotal: 0,
    });
    return { ok: false, error: lockErr, actor: actor };
  }

  try {
    if (enforceCooldown && isRunInCooldownWindow(RUN_DIGEST_CONFIG.COOLDOWN_MINUTES)) {
      var skipMsg = 'Skipped: last run was less than ' + RUN_DIGEST_CONFIG.COOLDOWN_MINUTES + ' minutes ago.';
      Logger.log('runDigestCore skipped (%s): %s', actor, skipMsg);
      return {
        ok: true,
        skipped: true,
        reason: 'cooldown',
        message: skipMsg,
        actor: actor,
      };
    }

    setLastRunState({
      status: 'running',
      error: '',
      groupsTotal: 0,
      itemsAfterDedupTotal: 0,
    });

    var collected = collectAllGroupsNews(RUN_CONFIG.WINDOW_HOURS);
    var dateStr = todayDateInTimezone(RUN_DIGEST_CONFIG.TIMEZONE);

    var summaries = summarizeAllGroupsWithOpenAI(collected.groups, dateStr);

    var nowIso = new Date().toISOString();
    writeSummariesOverwrite(summaries, nowIso);

    setLastRunState({
      status: 'ok',
      error: '',
      groupsTotal: summaries.length,
      itemsAfterDedupTotal: collected.totals.itemsAfterDedup,
    });

    var response = {
      ok: true,
      actor: actor,
      date: dateStr,
      ranAt: nowIso,
      stats: {
        groupsTotal: summaries.length,
        itemsAfterDedupTotal: collected.totals.itemsAfterDedup,
        openaiCalls: Math.max(1, Math.ceil(summaries.length / Number(OPENAI_CONFIG.MAX_GROUPS_PER_OPENAI_CALL || 12))),
        errorsCount: collected.errors.length,
      },
      errors: collected.errors,
    };

    Logger.log('runDigestCore done (%s): %s', actor, JSON.stringify(response.stats));
    return response;
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    setLastRunState({
      status: 'error',
      error: msg,
      groupsTotal: 0,
      itemsAfterDedupTotal: 0,
    });
    Logger.log('runDigestCore failed (%s): %s', actor, msg);
    return { ok: false, error: msg, actor: actor };
  } finally {
    lock.releaseLock();
  }
}

function isRunInCooldownWindow(cooldownMinutes) {
  var state = getLastRunState();
  if (!state.lastRunAt) return false;

  var lastMs = Date.parse(state.lastRunAt);
  if (!isFinite(lastMs)) return false;

  var elapsedMs = Date.now() - lastMs;
  return elapsedMs >= 0 && elapsedMs < Number(cooldownMinutes || 0) * 60 * 1000;
}
