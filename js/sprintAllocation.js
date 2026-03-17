// js/sprintAllocation.js
// Pure functions for computing focus allocation and tier checking
// from story arrays. No DB calls, no DOM access.

/**
 * Derive per-focus block allocation from a set of stories.
 * Returns an array sorted by allocated descending.
 *
 * @param {Story[]} stories
 * @param {Focus[]} allFocuses  — for colour lookup
 * @returns {FocusAllocation[]}
 *   { focusName, weight, pct, color }
 */
export function deriveFocusAllocation(stories, allFocuses = []) {
  const colorMap = Object.fromEntries(
    allFocuses.map(f => [f.name, f.color || '#888'])
  );

  const totals = {};
  let grand = 0;
  for (const s of stories) {
    if (!s.focus) continue;
    totals[s.focus] = (totals[s.focus] || 0) + (s.weight || 0);
    grand += (s.weight || 0);
  }

  return Object.entries(totals)
    .map(([focusName, weight]) => ({
      focusName,
      weight,
      pct:   grand > 0 ? Math.round((weight / grand) * 100) : 0,
      color: colorMap[focusName] || '#888',
    }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Check whether stories fit within the sprint's tiered capacity.
 * Returns a check result for each tier.
 *
 * @param {Story[]}         stories        — stories assigned to sprint
 * @param {SprintCapacity}  sprintCapacity — from deriveSprintCapacity()
 * @returns {TierCheck}
 *   { tiers: TierCheck[], unassignedWeight, totalAllocated }
 */
export function deriveTierCheck(stories, sprintCapacity) {
  const TIERS = ['primary', 'secondary1', 'secondary2', 'floor'];
  const TIER_LABEL = {
    primary:    'Primary',
    secondary1: 'Secondary 1',
    secondary2: 'Secondary 2',
    floor:      'Floor',
  };

  const allocated = { primary: 0, secondary1: 0, secondary2: 0, floor: 0 };
  for (const s of stories) {
    const tier = s.priority;
    if (tier && tier in allocated) {
      allocated[tier] += (s.weight || 0);
    }
  }

  const unassigned = stories
    .filter(s => !s.priority)
    .reduce((sum, s) => sum + (s.weight || 0), 0);

  return {
    tiers: TIERS.map(tier => {
      const avail = sprintCapacity[tier] || 0;
      const alloc = allocated[tier];
      return {
        tier,
        label:     TIER_LABEL[tier],
        allocated: alloc,
        available: avail,
        ok:        alloc <= avail,
        pct:       avail > 0 ? Math.round((alloc / avail) * 100) : (alloc > 0 ? 999 : 0),
      };
    }),
    unassignedWeight: unassigned,
    totalAllocated:   Object.values(allocated).reduce((a, b) => a + b, 0) + unassigned,
  };
}

/**
 * Derive focus allocation for multiple sprints at once.
 * Used by the portfolio timeline.
 *
 * @param {Sprint[]}  sprints
 * @param {Story[]}   allStories
 * @param {Focus[]}   allFocuses
 * @returns {Object}  { [sprintId]: { allocation: FocusAllocation[], totalWeight: number } }
 */
export function deriveMultiSprintAllocation(sprints, allStories, allFocuses) {
  const result = {};
  for (const sprint of sprints) {
    const sprintStories = allStories.filter(s => s.sprintId === sprint.id);
    const allocation    = deriveFocusAllocation(sprintStories, allFocuses);
    const totalWeight   = sprintStories.reduce((sum, s) => sum + (s.weight || 0), 0);
    result[sprint.id]   = { allocation, totalWeight };
  }
  return result;
}

/**
 * Compare focus ranking intent against actual allocation.
 * Returns an array with alignment metadata per focus.
 *
 * @param {string[]}          focusRanking  — ordered intent array from sprint
 * @param {FocusAllocation[]} allocation    — from deriveFocusAllocation()
 * @returns {RankingComparison[]}
 *   { focusName, intendedRank, actualRank, weight, pct, aligned, status, color }
 */
export function compareRankingToAllocation(focusRanking, allocation) {
  const actualRankMap = Object.fromEntries(
    allocation.map((a, i) => [a.focusName, i + 1])
  );
  const intentRankMap = Object.fromEntries(
    (focusRanking || []).map((name, i) => [name, i + 1])
  );

  const allNames = new Set([
    ...(focusRanking || []),
    ...allocation.map(a => a.focusName),
  ]);

  return [...allNames].map(name => {
    const intendedRank = intentRankMap[name] ?? null;
    const actualRank   = actualRankMap[name] ?? null;
    const allocEntry   = allocation.find(a => a.focusName === name);

    const aligned = intendedRank !== null && actualRank !== null
      ? Math.abs(intendedRank - actualRank) <= 1
      : false;

    return {
      focusName:    name,
      intendedRank,
      actualRank,
      weight:       allocEntry?.weight || 0,
      pct:          allocEntry?.pct    || 0,
      color:        allocEntry?.color  || '#888',
      aligned,
      status: intendedRank === null
        ? 'unranked'
        : actualRank === null
          ? 'missing'
          : aligned
            ? 'aligned'
            : actualRank < intendedRank
              ? 'over-indexed'
              : 'under-indexed',
    };
  }).sort((a, b) => {
    if (a.intendedRank && b.intendedRank) return a.intendedRank - b.intendedRank;
    if (a.intendedRank) return -1;
    if (b.intendedRank) return 1;
    return (b.weight || 0) - (a.weight || 0);
  });
}
