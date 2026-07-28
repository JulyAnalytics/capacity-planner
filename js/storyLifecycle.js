// ── storyLifecycle — story status lifecycle side-effects ─────────────────────
// Strangler-fig extraction from app.js (design-review pass 2 §II.7 B): the
// functions sharing the stories store's *lifecycle* responsibility — complete /
// abandon / block / unblock, dependent unblocking, timeSpent capture, epic
// auto-completion — describable in one sentence without "and"... of statuses.
//
// Every write funnels through window.storyWrites (ADR-0006), so the structured
// 'story' emit, rollback, and the spine's transition guard apply uniformly.
// These side-effects were previously unreachable: the live status writers wrote
// `status` raw, so epics never auto-completed and dependents never unblocked
// (design-review pass 1, A6).
// References shared IIFE globals: window.app, window.storyWrites, window.showToast.

import { STORY_STATUS, EPIC_STATUS } from './constants.js';

function _stories() { return window.app?.data?.stories || []; }
function _lcStory(id) { return _stories().find(s => s.id === id) || null; }

// Total blocks logged against a story across dailyLogs[].stories — live again
// now that the Today view writes per-day entries (design-review pass 1, A7).
function getStoryTimeSpent(storyId) {
  let total = 0;
  (window.app?.data?.dailyLogs || []).forEach(log => {
    (log.stories || []).forEach(s => {
      if ((s.id || s.storyId) === storyId) total += s.timeSpent || s.blocks || s.effort || 0;
    });
  });
  return total;
}

async function completeStory(storyId) {
  const story = _lcStory(storyId);
  if (!story) return false;

  const timeSpent = getStoryTimeSpent(storyId);
  const updates = {
    status: STORY_STATUS.COMPLETED,
    completed: true,
    completedAt: new Date().toISOString(),
    timeSpent,
  };
  // Variance vs the legacy estimate field only where one exists — new records
  // carry effort in `weight` alone (ADR-0009).
  if (story.estimatedBlocks && story.estimatedBlocks > 0) {
    updates.estimateVariance = timeSpent - story.estimatedBlocks;
    updates.estimateAccuracy = story.estimatedBlocks / Math.max(timeSpent, 0.01);
  }

  const ok = await window.storyWrites.commitStoryUpdate(storyId, updates);
  if (!ok) return false;

  await _unblockDependents(storyId);
  if (story.epicId) await checkEpicCompletion(story.epicId);
  return true;
}

async function abandonStory(storyId, reason = '') {
  const story = _lcStory(storyId);
  if (!story) return false;

  const ok = await window.storyWrites.commitStoryUpdate(storyId, {
    status: STORY_STATUS.ABANDONED,
    abandonedAt: new Date().toISOString(),
    abandonReason: reason || '',
    timeSpent: getStoryTimeSpent(storyId),
  });
  if (!ok) return false;

  await _unblockDependents(storyId); // abandoned also unblocks
  if (story.epicId) await checkEpicCompletion(story.epicId);
  return true;
}

async function blockStory(storyId, unblockedByStoryId = null) {
  return window.storyWrites.commitStoryUpdate(storyId, {
    status: STORY_STATUS.BLOCKED,
    blocked: true,
    unblockedBy: unblockedByStoryId || null,
  });
}

async function unblockStory(storyId) {
  return window.storyWrites.commitStoryUpdate(storyId, {
    status: STORY_STATUS.ACTIVE,
    blocked: false,
    unblockedBy: null,
  });
}

async function activateStory(storyId) {
  const story = _lcStory(storyId);
  if (!story) return false;
  const ok = await window.storyWrites.commitStoryUpdate(storyId, {
    status: STORY_STATUS.ACTIVE,
    activatedAt: new Date().toISOString(),
  });
  if (!ok) return false;

  // Activate a still-planning parent epic
  if (story.epicId) {
    const epic = (window.app?.data?.epics || []).find(e => e.id === story.epicId);
    if (epic && epic.status === EPIC_STATUS.PLANNING) {
      epic.status = EPIC_STATUS.ACTIVE;
      await window.app.saveEpic(epic);
    }
  }
  return true;
}

// Single entry point for the UI: route a requested status through the right
// lifecycle path so side-effects always fire. Illegal transitions are rejected
// by the spine's canTransitionStatus guard and surface as a toast.
async function setStatus(storyId, next) {
  switch (next) {
    case STORY_STATUS.COMPLETED: return completeStory(storyId);
    case STORY_STATUS.ABANDONED: return abandonStory(storyId);
    case STORY_STATUS.BLOCKED:   return blockStory(storyId);
    case STORY_STATUS.ACTIVE: {
      const story = _lcStory(storyId);
      return story?.blocked ? unblockStory(storyId) : activateStory(storyId);
    }
    default:
      return window.storyWrites.commitStoryUpdate(storyId, { status: next });
  }
}

async function _unblockDependents(storyId) {
  const dependents = _stories().filter(s => s.unblockedBy === storyId && s.blocked);
  for (const dep of dependents) {
    await window.storyWrites.commitStoryUpdate(dep.id, {
      blocked: false,
      unblockedBy: null,
      status: STORY_STATUS.ACTIVE,
    });
  }
}

async function checkEpicCompletion(epicId) {
  const epic = (window.app?.data?.epics || []).find(e => e.id === epicId);
  if (!epic || epic.status === EPIC_STATUS.ARCHIVED) return;

  const epicStories = _stories().filter(s => s.epicId === epicId);
  if (epicStories.length === 0) return;

  const allDone = epicStories.every(s =>
    s.status === STORY_STATUS.COMPLETED || s.status === STORY_STATUS.ABANDONED);

  if (allDone && epic.status !== EPIC_STATUS.COMPLETED) {
    epic.status = EPIC_STATUS.COMPLETED;
    epic.completedAt = new Date().toISOString();
    await window.app.saveEpic(epic);
    window.showToast?.(`Epic "${epic.name}" auto-completed!`, 'success');
  }
}

// @owns storyLifecycle — story status lifecycle side-effects (complete/abandon/block/unblock, dependent unblocking, epic auto-completion); all writes via storyWrites.
window.storyLifecycle = {
  setStatus,
  completeStory,
  abandonStory,
  blockStory,
  unblockStory,
  activateStory,
  checkEpicCompletion,
  getStoryTimeSpent,
};
