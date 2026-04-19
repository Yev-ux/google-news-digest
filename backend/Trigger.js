/**
 * Stage 6 trigger helpers.
 */

function installDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'scheduledRun') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('scheduledRun')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .inTimezone('Asia/Qyzylorda')
    .create();

  return {
    ok: true,
    handler: 'scheduledRun',
    timezone: 'Asia/Qyzylorda',
    hour: 6,
  };
}

function scheduledRun() {
  var result = runDigestCore({
    actor: 'scheduled',
    enforceCooldown: true,
  });

  Logger.log('scheduledRun result: %s', JSON.stringify(result));
  return result;
}
