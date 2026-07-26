import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newId, suggestKeyPrefix, todayLocalISO, isOverdue,
  appendActivity, allLabels, formatDue, EPIC_COLORS, PRIORITIES, TYPES, matchesFilters,
  blockedByIssues, blockingIssues,
  daysBetween, addDaysISO, issueDateRange, rollupRange, epicDateRange,
} from '../js/logic.js';

test('newId returns distinct non-empty strings', () => {
  const a = newId(), b = newId();
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);
});

test('suggestKeyPrefix: multi-word takes initials', () => {
  assert.equal(suggestKeyPrefix("Harry's Goals"), 'HG');
  assert.equal(suggestKeyPrefix('My Kanban'), 'MK');
  assert.equal(suggestKeyPrefix('a b c d e'), 'ABCD');
});

test('suggestKeyPrefix: single word takes first three letters', () => {
  assert.equal(suggestKeyPrefix('Goals'), 'GOA');
});

test('suggestKeyPrefix: empty or letterless input falls back to PK', () => {
  assert.equal(suggestKeyPrefix(''), 'PK');
  assert.equal(suggestKeyPrefix('123'), 'PK');
});

test('todayLocalISO formats a known date', () => {
  assert.equal(todayLocalISO(new Date(2026, 6, 15)), '2026-07-15');
});

test('isOverdue is strict past-date comparison', () => {
  assert.equal(isOverdue('2026-07-14', '2026-07-15'), true);
  assert.equal(isOverdue('2026-07-15', '2026-07-15'), false);
  assert.equal(isOverdue('', '2026-07-15'), false);
  assert.equal(isOverdue(undefined, '2026-07-15'), false);
});

test('appendActivity appends and caps at 100', () => {
  let a = appendActivity(undefined, 'first', 1);
  assert.deepEqual(a, [{ ts: 1, text: 'first' }]);
  for (let i = 0; i < 104; i++) a = appendActivity(a, 'e' + i, i + 2);
  assert.equal(a.length, 100);
  assert.equal(a[99].text, 'e103');
  assert.equal(a[0].text, 'e4');
});

test('allLabels: unique and sorted, tolerates missing labels', () => {
  assert.deepEqual(
    allLabels([{ labels: ['b', 'a'] }, { labels: ['a', 'c'] }, {}]),
    ['a', 'b', 'c'],
  );
});

test('formatDue renders day + short month', () => {
  assert.equal(formatDue('2026-07-15'), '15 Jul');
  assert.equal(formatDue('2026-01-03'), '3 Jan');
});

test('constants are well-formed', () => {
  assert.equal(EPIC_COLORS.length, 8);
  assert.deepEqual(PRIORITIES.map(p => p[0]), ['highest', 'high', 'medium', 'low', 'lowest']);
  assert.deepEqual(TYPES.map(t => t[0]), ['task', 'story', 'bug']);
});

const issue = {
  title: 'Fix login flow', description: 'OAuth redirect bug', key: 'HG-7',
  labels: ['auth', 'web'], type: 'bug', epicId: 'e1',
  dueDate: '2026-07-01', status: 'col-doing',
};

test('matchesFilters: empty filters match everything', () => {
  assert.equal(matchesFilters(issue, {}), true);
});

test('matchesFilters: text searches title/description/key/labels, case-insensitive', () => {
  assert.equal(matchesFilters(issue, { text: 'oauth' }), true);
  assert.equal(matchesFilters(issue, { text: 'hg-7' }), true);
  assert.equal(matchesFilters(issue, { text: 'AUTH' }), true);
  assert.equal(matchesFilters(issue, { text: 'payments' }), false);
});

test('matchesFilters: type/label/epic narrow correctly', () => {
  assert.equal(matchesFilters(issue, { type: 'bug' }), true);
  assert.equal(matchesFilters(issue, { type: 'task' }), false);
  assert.equal(matchesFilters(issue, { label: 'web' }), true);
  assert.equal(matchesFilters(issue, { label: 'infra' }), false);
  assert.equal(matchesFilters(issue, { epicId: 'e1' }), true);
  assert.equal(matchesFilters(issue, { epicId: 'e2' }), false);
});

test("matchesFilters: epicId 'none' matches only epic-less issues", () => {
  assert.equal(matchesFilters(issue, { epicId: 'none' }), false);
  assert.equal(matchesFilters({ ...issue, epicId: null }, { epicId: 'none' }), true);
});

test('matchesFilters: overdue respects today and done column', () => {
  const f = { overdue: true, today: '2026-07-15', doneStatus: 'col-done' };
  assert.equal(matchesFilters(issue, f), true);
  assert.equal(matchesFilters({ ...issue, dueDate: '2026-08-01' }, f), false);
  assert.equal(matchesFilters({ ...issue, status: 'col-done' }, f), false);
});

test('matchesFilters: filters combine with AND', () => {
  assert.equal(matchesFilters(issue, { text: 'login', type: 'bug', label: 'auth' }), true);
  assert.equal(matchesFilters(issue, { text: 'login', type: 'story' }), false);
});

test('blockedByIssues: resolves referenced issues, ignores missing/deleted ids', () => {
  const all = [{ id: 'a', key: 'A-1' }, { id: 'b', key: 'A-2' }];
  assert.deepEqual(blockedByIssues({ blockedBy: ['a', 'missing'] }, all).map(i => i.id), ['a']);
});

test('blockedByIssues: empty when blockedBy is missing or empty', () => {
  assert.deepEqual(blockedByIssues({}, [{ id: 'a' }]), []);
  assert.deepEqual(blockedByIssues({ blockedBy: [] }, [{ id: 'a' }]), []);
});

test('blockingIssues: finds issues whose blockedBy references this issue', () => {
  const all = [
    { id: 'a', blockedBy: ['x'] },
    { id: 'b', blockedBy: ['x', 'y'] },
    { id: 'c', blockedBy: [] },
  ];
  assert.deepEqual(blockingIssues({ id: 'x' }, all).map(i => i.id), ['a', 'b']);
});

test('daysBetween counts whole days, including across months', () => {
  assert.equal(daysBetween('2026-07-20', '2026-07-27'), 7);
  assert.equal(daysBetween('2026-07-27', '2026-07-20'), -7);
  assert.equal(daysBetween('2026-07-31', '2026-08-01'), 1);
  assert.equal(daysBetween('2026-01-01', '2026-01-01'), 0);
});

test('addDaysISO adds/subtracts days and rolls over month/year boundaries', () => {
  assert.equal(addDaysISO('2026-07-27', 7), '2026-08-03');
  assert.equal(addDaysISO('2026-07-27', -14), '2026-07-13');
  assert.equal(addDaysISO('2026-12-28', 7), '2027-01-04');
});

test('issueDateRange: both dates set uses them verbatim', () => {
  assert.deepEqual(
    issueDateRange({ startDate: '2026-07-20', dueDate: '2026-08-03' }),
    { start: '2026-07-20', end: '2026-08-03' },
  );
});

test('issueDateRange: only dueDate collapses to a single-day range', () => {
  assert.deepEqual(issueDateRange({ dueDate: '2026-08-03' }), { start: '2026-08-03', end: '2026-08-03' });
});

test('issueDateRange: only startDate collapses to a single-day range', () => {
  assert.deepEqual(issueDateRange({ startDate: '2026-07-20' }), { start: '2026-07-20', end: '2026-07-20' });
});

test('issueDateRange: no dates returns null', () => {
  assert.equal(issueDateRange({}), null);
  assert.equal(issueDateRange({ startDate: '', dueDate: '' }), null);
});

test('rollupRange: spans the min start and max end, ignoring nulls', () => {
  assert.deepEqual(
    rollupRange([
      { start: '2026-08-01', end: '2026-08-10' },
      null,
      { start: '2026-07-20', end: '2026-08-05' },
    ]),
    { start: '2026-07-20', end: '2026-08-10' },
  );
});

test('rollupRange: empty or all-null input returns null', () => {
  assert.equal(rollupRange([]), null);
  assert.equal(rollupRange([null, null]), null);
});

test('epicDateRange: explicit epic dates win over child rollup', () => {
  const epic = { id: 'e1', startDate: '2026-01-01', dueDate: '2026-12-31' };
  const issues = [{ epicId: 'e1', startDate: '2026-07-20', dueDate: '2026-08-03' }];
  assert.deepEqual(epicDateRange(epic, issues), { start: '2026-01-01', end: '2026-12-31' });
});

test('epicDateRange: falls back to rollup of child issue dates when unset', () => {
  const epic = { id: 'e1' };
  const issues = [
    { epicId: 'e1', dueDate: '2026-08-10' },
    { epicId: 'e1', startDate: '2026-07-20', dueDate: '2026-07-27' },
    { epicId: 'e2', startDate: '2020-01-01', dueDate: '2020-01-02' },
  ];
  assert.deepEqual(epicDateRange(epic, issues), { start: '2026-07-20', end: '2026-08-10' });
});

test('epicDateRange: no epic dates and no dated children returns null', () => {
  assert.equal(epicDateRange({ id: 'e1' }, [{ epicId: 'e1' }]), null);
});
