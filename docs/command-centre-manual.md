# Command-centre manual

How to actually use this board day to day. (For the rules Claude follows
when *creating* epics/tickets/subtasks, see
`docs/command-centre-conventions.md` instead — this doc is about how
*you* work the board once things are on it.)

## The core loop: pull, don't push

**Backlog holds everything. To Do holds today.**

Nothing "belongs" in To Do by default — new tickets land in Backlog. Each
day (or each sitting-down-to-work session), look at Backlog sorted by
priority, and drag 1–3 things into To Do. Finish them, drag to Done,
repeat tomorrow. That's the whole mechanism — there's no separate
"daily goal" feature because the To Do column already is one.

Don't try to keep everything relevant "active" at once. A full Backlog is
normal and healthy — it means nothing got forgotten, not that you're
behind.

## What the fields mean in practice

- **Priority** (`highest`→`lowest`): urgency/importance, independent of
  effort. A `highest` 1-point ticket and a `highest` 8-point ticket can
  both be true at once.
- **Story points**: a rough complexity/effort scale (1 = <30 min, 2 = <2h,
  3 = half a day, 5 = a full day, 8 = multi-day — and an 8 usually means
  it should've been split into subtasks or sibling tickets instead).
  This is about *your* effort, not calendar time — a ticket can be
  "3 points" of active work spread across weeks of waiting (e.g. a
  passport renewal).
- **Labels — timeframe** (`short-term` / `medium-term` / `long-term` /
  `daily`): this is your pacing signal, separate from priority.
  - `short-term` — worth doing in the next 1–2 weeks.
  - `medium-term` — this semester/season; don't feel behind if it's
    untouched right now.
  - `long-term` — this year or beyond; exists so it isn't lost, not so
    you feel pressure about it today.
  - `daily` — a standing habit with steady, repeated progress (e.g. one
    course module a day), *or* an ongoing mindset to carry into
    something you're already doing (e.g. "ask good questions during the
    internship") rather than a discrete task with a finish line. Not
    every `daily`-labeled ticket needs to be dragged into To Do every
    single day — some are reminders, not checkboxes.
- **Epic**: one distinct goal or initiative. When a goal has several
  different *kinds* of work feeding into it (e.g. a career goal made of
  certifications + a portfolio project + networking + eventually job
  applications), that becomes **several epics**, not one epic with
  everything crammed in — see the worked example below.

## Sequencing matters — check dependencies before pulling

Before dragging something into To Do, sanity-check it isn't blocked by
something else still sitting in Backlog (a `blocked` label or the
ticket's description usually says so). Example: a ticket to reply to an
official email was blocked on updating ID details first — pulling the
reply into To Do before the ID update was done would've meant
attempting it and immediately bouncing off the blocker.

## Don't overload To Do

If To Do has more than ~3 items that each need real daily attention,
that's a sign to either finish/clear some first, or accept that some of
them only need one focused session this week rather than daily
attention — not to grind through all of them every day. A big Backlog
with correct priorities is more sustainable than a crammed To Do.

## Worked example: a big multi-year goal → several epics

"Land a DevOps job" isn't one ticket or even one epic — it's five,
because the actual work is genuinely different in kind:

| Epic | Kind of work | Pace |
|---|---|---|
| Pass RHCSA RHEL 10 Exam | Structured course, fixed curriculum | `daily` — steady module-a-day |
| Build DevOps Portfolio Project | One real deployed system, built in stages | pull one stage per week once started |
| AWS & Cloud Certifications | Self-study toward exams, in a fixed order | `medium-term` → `long-term`, sequential |
| Sharpen Interview & System Design Skills | Ongoing light maintenance | `short-term`, low weekly time budget |
| Network & Build DevOps Presence | Relationships and visibility, not "tasks" with a finish line | mostly `daily`/`medium-term`, some tickets are reminders not checkboxes |
| Apply for DevOps Roles | The final stage, months out | `long-term` — don't touch until the rest is real |

Each epic runs at its *own* pace. The mistake to avoid is treating all
of them as equally "active" at once — RHCSA genuinely wants daily
attention; job applications shouldn't be touched for months. Priority
and the timeframe label together tell you which is which; you don't
have to hold the whole plan in your head.

## Asking Claude to manage the board

You can hand off goals/tasks in chat at any time ("I need to do X",
"here's a course I'm starting", "help me organize Y") and Claude will
create the epics/tickets/subtasks following
`docs/command-centre-conventions.md`, after reading the board's current
state first so it doesn't duplicate or clobber anything. You can also
edit directly through the UI — the two stay in sync because Claude
always reads before writing.
