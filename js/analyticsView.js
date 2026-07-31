// ── analyticsView — the Analytics tab's report ───────────────────────────────
// Strangler-fig extraction (cut #4): moved VERBATIM out of the CapacityManager
// god-class. The only substitution is `this.data` → `window.app.data`, matching
// how dataPortability was extracted. No behaviour change — the pre/post output
// is diffed on the same month as the acceptance check.
//
// One responsibility, one sentence, no "and": render the capacity report for a
// selected month/week from calendar + dailyLogs + locationPeriods.
//
// This extraction is the prerequisite for the Strategy tab, which needs a
// `switchTab` branch — the first js/app.js touch the strategic layer makes, so
// the rule required paying down a responsibility first (CLAUDE.md strangler-fig).
//
// @owns analyticsView — the Analytics tab report: planned/actual/utilized/adherence metrics + the daily summary table.
// @see ADR-0014

import { deriveCapacityForDateRange } from './locationCapacity.js';

function generateAnalytics() {
  const app = window.app;
  const month = document.getElementById('analyticsMonth').value;
  const week = document.getElementById('analyticsWeek').value;
  const container = document.getElementById('analyticsReport');

  let calendarData = app.data.calendar.filter(c => c.month === month);
  if (week) calendarData = calendarData.filter(c => String(c.week) === week);

  const year = new Date().getFullYear();
  const startDate = new Date(year, parseInt(month) - 1, week ? (parseInt(week) - 1) * 7 + 1 : 1);
  const endDate = week
    ? new Date(year, parseInt(month) - 1, parseInt(week) * 7)
    : new Date(year, parseInt(month), 0);

  const periodStartIso = startDate.toISOString().slice(0, 10);
  const periodEndIso   = endDate.toISOString().slice(0, 10);

  const allLocPeriods  = app.data.locationPeriods || [];
  const allOverrides   = app.data.dayTypeOverrides || [];

  const periodsInRange = allLocPeriods.filter(p =>
    p.startDate <= periodEndIso && p.endDate >= periodStartIso
  );

  if (calendarData.length === 0 && periodsInRange.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No data for this period.</div>';
    return;
  }

  let planned, plannedPriority;
  if (periodsInRange.length > 0) {
    const derived = deriveCapacityForDateRange(
      periodStartIso, periodEndIso, allLocPeriods, allOverrides
    );
    planned         = derived.total;
    plannedPriority = derived.priority;
  } else {
    planned         = calendarData.reduce((s, w) => s + w.capacities.total, 0);
    plannedPriority = calendarData.reduce((s, w) => s + w.capacities.priority, 0);
  }

  const stories = app.data.stories.filter(s => s.month === month);
  const storyCapacity = stories.reduce((s, st) => s + (st.weight || 0), 0);

  const logs = app.data.dailyLogs.filter(l => {
    const d = new Date(l.date);
    return d >= startDate && d <= endDate;
  });

  const actual = logs.reduce((s, l) => s + (l.actualCapacity || l.plannedCapacity || 0), 0);
  const utilized = logs.reduce((s, l) => {
    const logStories = l.stories || l.storyEfforts || [];
    return s + logStories.reduce((sum, e) => sum + (e.timeSpent || e.effort || 0), 0);
  }, 0);

  const efficiency = actual > 0 ? (utilized / actual * 100) : 0;
  const adherence = planned > 0 ? (actual / planned * 100) : 0;

  container.innerHTML = `
    <div class="analytics-section">
      <h3>Capacity</h3>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-label">Planned</div><div class="metric-value">${planned}</div><div class="metric-sublabel">blocks</div></div>
        <div class="metric-card"><div class="metric-label">Actual</div><div class="metric-value">${actual}</div><div class="metric-sublabel">${(actual - planned) >= 0 ? '+' : ''}${(actual - planned).toFixed(1)} variance</div></div>
        <div class="metric-card"><div class="metric-label">Utilized</div><div class="metric-value">${utilized}</div><div class="metric-sublabel">${efficiency.toFixed(0)}% efficiency</div></div>
        <div class="metric-card"><div class="metric-label">Adherence</div><div class="metric-value">${adherence.toFixed(0)}%</div><div class="metric-sublabel">plan accuracy</div></div>
      </div>
    </div>
    <div class="analytics-section">
      <h3>Priority Breakdown</h3>
      <div class="metrics-grid">
        <div class="metric-card"><div class="metric-label">Priority Cap</div><div class="metric-value">${plannedPriority}</div><div class="metric-sublabel">blocks</div></div>
        <div class="metric-card"><div class="metric-label">Stories Planned</div><div class="metric-value">${storyCapacity}</div><div class="metric-sublabel">${stories.length} stories</div></div>
      </div>
    </div>
    ${logs.length > 0 ? `
    <div class="analytics-section">
      <h3>Daily Summary</h3>
      <table><thead><tr><th>Date</th><th>Type</th><th>Cap</th><th>Used</th><th>Eff</th></tr></thead>
      <tbody>${logs.sort((a, b) => a.date.localeCompare(b.date)).map(l => {
        const cap = l.actualCapacity || l.plannedCapacity || 0;
        const logStories = l.stories || l.storyEfforts || [];
        const used = logStories.reduce((s, e) => s + (e.timeSpent || e.effort || 0), 0);
        return `<tr>
          <td>${new Date(l.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
          <td>${l.dayType}</td><td>${cap}</td><td>${used}</td>
          <td>${cap > 0 ? Math.round(used / cap * 100) : 0}%</td>
        </tr>`;
      }).join('')}</tbody></table>
    </div>` : '<p class="empty-state">No daily logs for this period</p>'}`;
}

window.analyticsView = { generateAnalytics };
