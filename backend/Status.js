/**
 * Stage 6 status endpoint response.
 */

function getRunStatusResponse() {
  var state = getLastRunState();
  return {
    ok: true,
    date: todayDateInTimezone('Asia/Qyzylorda'),
    timezone: 'Asia/Qyzylorda',
    windowHours: RUN_CONFIG.WINDOW_HOURS,
    lastRunAt: state.lastRunAt,
    lastRunStatus: state.lastRunStatus || 'unknown',
    lastRunError: state.lastRunError,
    lastRunGroups: state.lastRunGroups,
    lastRunItems: state.lastRunItems,
  };
}
