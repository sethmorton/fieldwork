# Fieldwork: instructions for setup and coding agents

## Goal and commands

Country/topic-agnostic adaptive GeoGuessr practice. Australia, the Philippines and Worldwide are supplied packs.
Use Node 24.12+; package-lock.json pins dependencies.

- Install: `npm ci`
- Tests + typecheck: `npm run check`
- Single test: `node --test src/tests/adaptive.test.mjs`
- Fetch AU notes locally: `npm run content:refresh`
- Fetch PH notes: `node scripts/refresh-notes.mjs content/philippines.json local/philippines-pack.json`
- Fetch World notes: `node scripts/refresh-notes.mjs content/worldwide.json local/worldwide-pack.json`
- Append a country: `npm run setup -- --map <different-owned-map> --pack local/philippines-pack.json --add`
- Configure/build: `npm run setup -- --map <owned-map-ID-or-URL> --pack local/pack.json`
- Rebuild: `npm run build`
- Build public content only: `npm run content:build` (every `content/*.json` is published; adding a pack is adding a file)
- Verify engine size/assets after build: `node scripts/verify-build.mjs`
- Installer: `npm run serve` → http://127.0.0.1:8787

Read docs/SETUP.md before guiding first-run setup. Do not claim browser
installation or successful live publication based on a build passing.

## First-run workflow

1. Ask only for missing information: country/topic and the user's separate
   owned practice map URL. Australia, the Philippines and Worldwide are supplied packs. Never use the
   author's or another learner's map as a shared writable practice map.
2. Have the user create/save a dedicated map named `Fieldwork - Practice`
   in native GeoGuessr Map Maker. Read the actual map ID; never invent one.
3. Run install, checks, source-note refresh and local setup commands above.
4. Guide Tampermonkey installation and Chrome userscript permission using
   the official vendor/site instructions. Respect your browser tool's rules:
   the human may need to finish extension pages or sign-in.
5. Open the configured map-maker in a fresh tab. Verify the Fieldwork panel.
   Continue practice replaces/publishes its five locations and starts a game.
   Ensure the user understands this map is dedicated to that purpose.
6. Leave round 1 ready. Never guess or submit learner feedback for testing.
   Bookmark the user's `/maps/<id>` URL. Local server can then stop.

## Code and data boundaries

- Keep changes small, read callers, write regression checks and run them.
- Native browser UI or supported tools for account operations; never copy
  cookies, credentials or API keys into this repository or local setup files.
- `.fieldwork.local.json`, `local/`, `dist/`, progress exports and learner
  backups must remain untracked. Published source-map IDs are provenance,
  not account access or writable practice-map bindings.
- Never embed content packs in the userscript. Keep runtime content, audit inventories
  and local learner state separate. Public publishing reads only unbound `content/*.json`.
- Pack bodies belong in IndexedDB, never GM storage: Tampermonkey loads every GM
  value into every GeoGuessr page. GM storage is for learner state and small pointers.
- Continue runs on GeoGuessr's main thread: keep selection linear (worldwide guard
  in `worldwide.test.mjs`) and navigate with GeoGuessr's router, not a page reload.
- Verify old/new next-set equivalence and pinned-game behavior when changing content storage.
- Preserve the user's practiceMapId during content migration. Preserve pack
  IDs/skill IDs so existing feedback remains attached to the right targets.
- In worldwide packs, retain `notesCountry` when matching identically named clues
  and enforce the configured country cap during selection and publication.
- Five distinct pedagogic families per set; rest previous-set targets when
  alternatives exist. A miss must not cause every-set repetition.
- Curriculum introductions use `skill.curriculum.scope` then `rank`; absent metadata
  is an unranked country foundation, never hidden. Preserve source provenance separately.
- Readiness is not mastery: 17/20 recent successes across eight skills (or all if fewer),
  plus 4/5 latest, opens the next supplied scope. Country foundations also require
  40 distinct practised skills (or all if fewer). Assignment without feedback does not count.
  Practice/assumptions can guide readiness. Teaching examples stay `assessmentEligible:false`.
  Explicit misses override assumptions.
- Worldwide regional/specialist introductions need country-specific foundation practice:
  at least three outcomes, 80% of the latest five successful, and the latest successful.
  Countries with no foundation lessons wait for 80% total foundation coverage.
  Already introduced clues remain available for review. Country-only packs start at their
  lowest supplied scope, without an absent country-identification gate.
- New-clue budgets are 1/2/3 below 70% / below 85% / at least 85% recent success
  (two with no feedback), and only fill slots placeable due reviews leave (reviews first).
  Normally at most one target per advanced scope per set, review or introduction.
  Review is scheduled by FSRS-6 (`src/lib/fsrs.ts`, ts-fsrs defaults) replayed from attempts: passed = Good,
  recognition miss or wrong answer = Again, unknown answer = no review; never store scheduler state.
  Packs with `gradingPolicy: 'recognition'` grade spotted = Good / missed = Again regardless of the
  country result (kept as `regionCorrect`); packs without it keep the country-scored rule.
  The longest-overdue due review is placed first and counts toward its scope quota (no starvation), then one due
  review per advanced scope, other due reviews (misses first, then lowest retrievability), then introductions;
  not-yet-due reviews only fill an otherwise short set. Cold start/rest/diversity
  can require extra introductions; sparse pools may relax scope, never family/country caps.
- Prerequisites can use three latest successful practice attempts, not only mastery.
  Reject cycles, missing IDs and active prerequisites without playable/orientation evidence.
- No pre-guess hints or upcoming target names. Correct geography alone is
  not recognition evidence. Assumed-on-advance feedback is practice, never
  verified mastery; explicit misses win and old rounds are not backfilled.
- Keep the post-round selection label to one plain line. Show curriculum counts and
  readiness only on the start panel, not alongside every revealed clue.
- In country-only regionguessing, exclude country-identification clues.
- Import actual panoramas from permitted sources, retaining attribution.
  Check native Map Maker Export JSON first; never invent coordinates.
- Source inventory != playable coverage != mastery. Deferred content stays
  inactive until real examples and claims are checked. Keep caveats.

## Verification

`fixtures/continue-fixture.html?mode=spacing` seeds synthetic misses and
exposes publication counters in the DOM. With the installer server running,
verify zero previous-set targets repeated, five distinct families and one
game started. No account or real learner state is used. Other modes include
`failure`, `pending`, `expired`, `wrong-map`.

`fixtures/game-fixture.html?mode=missed-start` retains a stale framework game
while emitting completed `GEFFetchEvents` responses. Verify the round-2 clue
recovers, Next hides it and saves only round 2, and round 3 shows its own card.
Do not reload a learner's results to test: GeoGuessr can resume the next round.

`browser-recovery.test.mjs` fuzzes 150 seeded orderings of framework/native
responses, reveals, stale responses and Next clicks; every round must show its own
card exactly once. Reproduce a reported "card missing" ordering there first.

`fixtures/recovery-fixture.html` emits a game response before navigation, then
reveals results through native relative fetch responses without framework events.
Verify each card recovers without issuing any additional game requests, Next saves once, and stale responses cannot replace the
current card. Retain responses by game token even before the URL switches.

For a real browser check, get consent for the dedicated map writes, preserve
the current game, verify post-guess feedback only after a real guess, and
never insert synthetic attempts into the user's userscript storage.
