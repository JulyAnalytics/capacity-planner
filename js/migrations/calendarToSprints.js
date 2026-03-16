/**
 * One-time migration: calendar entries → Sprint records.
 * Run once after Phase 1 ships. Safe to re-run (idempotent).
 * Pre-migration sprints use id format '${year}-CAL-W${week}' to distinguish
 * from post-migration sprints which use '${year}-S${nn}'.
 */

import DB from '../db.js';

export async function migrateCalendarToSprints() {
  const migrationKey = 'calendar_to_sprints_migration';
  const done = await DB.get(DB.STORES.METADATA, migrationKey);
  if (done?.value) { console.log('Migration already run, skipping.'); return; }

  const calendarEntries = await DB.getAll(DB.STORES.CALENDAR);
  const stories         = await DB.getAll(DB.STORES.STORIES);

  let converted = 0;
  let skipped   = 0;

  for (const entry of calendarEntries) {
    const sprintId = `${entry.year}-CAL-W${String(entry.week).padStart(2, '0')}`;

    const existing = await DB.get(DB.STORES.SPRINTS, sprintId);
    if (existing) { skipped++; continue; }

    const startDate = _isoWeekToMonday(parseInt(entry.year), parseInt(entry.week));
    if (!startDate) {
      console.warn(`Could not derive startDate for calendar entry ${entry.id}, skipping.`);
      skipped++;
      continue;
    }

    const sprint = {
      id:            sprintId,
      sprintNumber:  null,
      startDate,
      durationWeeks: 1,
      status:        'done',
      goal:          entry.capstone || null,
      createdAt:     new Date().toISOString(),
      _migratedFromCalendar: true,
    };
    await DB.put(DB.STORES.SPRINTS, sprint);
    converted++;
  }

  // Migrate story.month + story.week → story.sprintId
  let storiesUpdated = 0;
  for (const story of stories) {
    if (story.sprintId) continue;
    if (!story.month || !story.week) continue;

    // Derive year from story.month if present, else use current year as approximation
    const year = story.year || new Date().getFullYear();
    const sprintId = `${year}-CAL-W${String(story.week).padStart(2, '0')}`;
    const sprint = await DB.get(DB.STORES.SPRINTS, sprintId);
    if (sprint) {
      story.sprintId = sprintId;
      await DB.put(DB.STORES.STORIES, story);
      storiesUpdated++;
    }
    // If no match: story remains with sprintId: null (shows in backlog bucket)
  }

  await DB.put(DB.STORES.METADATA, {
    key:       migrationKey,
    value:     true,
    converted,
    skipped,
    storiesUpdated,
    timestamp: new Date().toISOString(),
  });

  console.log(`Migration complete: ${converted} calendar entries → sprints, ${storiesUpdated} stories updated, ${skipped} skipped.`);
  return { converted, skipped, storiesUpdated };
}

function _isoWeekToMonday(year, week) {
  // Jan 4 is always in week 1
  const jan4    = new Date(year, 0, 4);
  const weekDay = (jan4.getDay() + 6) % 7; // 0=Mon
  const week1Mon = new Date(jan4);
  week1Mon.setDate(jan4.getDate() - weekDay);
  const targetMon = new Date(week1Mon);
  targetMon.setDate(week1Mon.getDate() + (week - 1) * 7);
  return targetMon.toISOString().slice(0, 10);
}
