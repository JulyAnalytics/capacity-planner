// DECISION: Import uses snapshot-then-write, not a true transaction.
// Rationale: IndexedDB has no cross-store transaction API. The closest safe
//            equivalent is: snapshot all stores → attempt all writes →
//            on any failure, restore from snapshot.
// Consequence: A failure during restore must be surfaced explicitly — it is a
//              worse outcome than the original failure and the user must be told.
// Date: 2026-04-14 | Author: [initials]
// Revisit if: a cross-store transaction API becomes available in IndexedDB.

// DECISION: Snapshot and restore utilities live in js/importUtils.js, not app.js.
// Rationale: app.js already has too many responsibilities. Snapshot/restore is a
//            distinct concern (import infrastructure) not a UI/app concern.
//            SRP test: app.js purpose cannot be stated without 'and' if it also
//            owns snapshot logic.
// Date: 2026-04-14 | Author: [initials]

// DECISION: Four notification states, not three.
// States: snapshot failure, full write success, write failure + restore success,
//         write failure + restore failure.
// Snapshot failure is distinct: nothing was written, user data is intact,
// but import was aborted — the user needs to know why and that data is safe.
// Date: 2026-04-14 | Author: [initials]

import DB from './db.js';

/** The stores covered by import. Metadata is excluded — it is never cleared on import.
 *  The strategic-layer stores (cycles, strategicSessions) are included so a full
 *  backup/restore round-trips the whole strategic layer, not just the work tier. */
const IMPORT_STORES = [
  DB.STORES.FOCUSES,
  DB.STORES.CALENDAR,
  DB.STORES.PRIORITIES,
  DB.STORES.SUB_FOCUSES,
  DB.STORES.EPICS,
  DB.STORES.STORIES,
  DB.STORES.DAILY_LOGS,
  DB.STORES.MONTHLY_PLANS,
  DB.STORES.SPRINTS,
  DB.STORES.TRAVEL_SEGMENTS,
  DB.STORES.LOCATION_PERIODS,
  DB.STORES.DAY_TYPE_OVERRIDES,
  DB.STORES.CYCLES,
  DB.STORES.STRATEGIC_SESSIONS,
];

/**
 * Reads all records from the twelve import stores in parallel.
 * Returns a snapshot object for use as a rollback source.
 * Throws if any store read fails — snapshot is all-or-nothing.
 *
 * @returns {Promise<Object>} — { [storeName]: records[] } for each of the 12 stores
 */
export async function snapshotAllStores() {
  const results = await Promise.all(IMPORT_STORES.map(s => DB.getAll(s)));
  return Object.fromEntries(IMPORT_STORES.map((s, i) => [s, results[i]]));
}

/**
 * Restores all stores in a snapshot produced by snapshotAllStores().
 * Clears then rewrites each store sequentially so failures identify the exact store.
 * Never throws — always returns a structured result.
 *
 * @param {Object} snapshot — produced by snapshotAllStores()
 * @returns {Promise<{
 *   restored: boolean,
 *   restoredStores: string[],
 *   failedStore: string | null,
 *   error: string | null
 * }>}
 */
export async function restoreFromSnapshot(snapshot) {
  const restoredStores = [];
  for (const [storeName, records] of Object.entries(snapshot)) {
    try {
      await DB.clear(storeName);
      await DB.putAll(storeName, records);
      restoredStores.push(storeName);
    } catch (err) {
      return {
        restored: false,
        restoredStores,
        failedStore: storeName,
        error: `Failed restoring ${storeName}: ${err.message}`,
      };
    }
  }
  return { restored: true, restoredStores, failedStore: null, error: null };
}
