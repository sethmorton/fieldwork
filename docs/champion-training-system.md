# Champion by Nov 14: training system, all plans in one place

Compiled 2026-11-03. Section 0 is the combined plan. Sections 1 to 12 are every source as written: confirmed goals, four research reports, Astra's critique, and six independent designs (3 Sonnet, 3 Sol).

## 0. Final combined plan (read this first)

**Goal:** Champion by Nov 14. Master now, close to Champion. 2+ h/day. Whole world mixed every day, plus one deep focus picked from data. Always new spots. Feature maps and region look maps. Cards with almost no text.

### Daily session (about 140 min, 120 active)

| Min | Block | What happens |
|---|---|---|
| 0 to 10 | Cold probe | 20 new world spots, 15 s, no teaching. Today's score. |
| 10 to 25 | Focus A | 3 blind guesses in the focus country, a Look board (45 s), then about 20 new spots |
| 25 to 30 | Break | |
| 30 to 45 | World mix A | about 35 new spots, ACoW-weighted, look-alike countries back to back |
| 45 to 50 | Break | |
| 50 to 65 | Feature block | 3 feature maps picked from your misses, each followed by 4 new test spots |
| 65 to 70 | Break | |
| 70 to 85 | Focus B | another part of the focus country, about 25 new spots |
| 85 to 100 | World mix B | about 35 new spots, the last 10 at 10 s |
| 100 to 110 | Break, `npm run refresh` | |
| 110 to 140 | Ranked duels | the real test |

Days 10 to 12 taper toward duels. Nov 14 is probe, then ranked.

### Deep focus
Score = ACoW share of the country × points lost per round there, smoothed so a few rounds can't dominate. Three designers ran it on `duels/rounds.json` separately and all got **the US first**, then Brazil, then Canada. US loss is mostly regions inside the country (29,732 pts right country vs 10,861 wrong country). Focus gets recalculated on days 4, 7 and 10. Scoring regions are each country's subdivisions grouped into macro-regions (US census divisions, Brazil's 5 regions, Russia's federal districts). Köppen climate zones later if needed.

### Screens
- **Feature map:** one country, one feature, at most 4 versions, a photo sticker for each pointing at its area. Plonk It's own image where one exists (Brazil poles).
- **Look board:** each region as a small shaded map plus 4 random new panoramas from it. Space reshuffles.
- **Miss card, 3 beats:** (1) map with your pin and the answer, (2) what the right region looks like, (3) what the region you pinned looks like. No sentences.
- **Correct answer:** a 1-second green flash, no card.

### Locations
50,927 Vali spots in `gap/pools/` across 127 countries. A ledger of every panorama you've seen so nothing repeats. Each region's pool split in half: study only (boards, cards) and drill/test only. `vali_pool()` needs an append mode for the big 8 countries.

### Measurement
Three numbers with error bars: country hit rate, points per round, fix rate (after a miss, a *different* spot from that region right a few rounds later). Round SD is about 1,470, so a gain of about 300 points per round shows up over 3 days. The fix rate moves within minutes.

### Build order

| # | What | Time | Unlocks |
|---|---|---|---|
| 1 | `deal.py`: ledger, study/drill split, daily pack, focus formula | 2 h | |
| 2 | Deal scheduler: next 5 unplayed spots, misses pull a retest spot | 1 h | probe, mix, focus and duels playable |
| 3 | 3-beat miss card with region map | 3 h | |
| 4 | Look boards | 1.5 h | full day 1 |
| 5 | Scoreboard tiles | 2 h | day 2 |
| 6 | Feature maps (first 8 by hand, Brazil poles first) | 5 h | day 3 |

### Where the designers differed, and what was picked
| Question | Options | Picked |
|---|---|---|
| Region units | Köppen zones (Sonnet C), admin macro-regions (Sonnet B), true-vs-pinned subdivision pairs (Sol A) | Admin macro-regions for scoring, subdivision pairs to choose contrasts |
| Drill timer | 12 s, 15 s, 20 s, 30 s | 15 s, falling to 10 s late |
| Focus switch | every 3 days, nightly with 20 to 25% margin | days 4, 7, 10 |
| Feature maps | cached Plonk It images vs generated | cached first, generate the rest |
| Rewards | streaks, fog-of-war world map (Sonnet A) vs celebrate practice only (Astra) | streak flash plus measured tiles, no fake gains |


---

## 1. Confirmed goals and problems

### Seth: confirmed goals and problems (he approved this exactly)

**Goal:** Champion rank in GeoGuessr ranked duels by **Nov 14, 2026** (~12 days from Nov 3). Currently Master, close to Champion. Map: A Competitive World (ACoW), ~87% rural, no move.

**How he wants to practice (2+ hours/day):**
1. The **whole world, mixed**, every session. NOT one topic per week. Do not narrow scope.
2. Plus **one deep-focus area picked by data** (biggest points lost per round).
3. **Always new spots, never repeats**: learn the region, not the photo.
4. **Both kinds of maps:**
   - **Feature maps**, Plonk It style: one feature (poles, soil, bollards...) drawn on the country map. He vividly remembers Plonk It's Brazil map of pole supports vs no supports.
   - **Region look maps**: each region shown with a strip of typical panoramas, so he sees what it generally looks like.

**Problems:**
1. **Skips cards** when there's too much on screen (current US vegetation miss card has 2 descriptions, 4 photos, 5 species, 3 cue tiles: ignored).
2. **No mental model** of how regions look in general. Plain Plonk It reading = glazing over. Maps help, but repeated panoramas teach photo-to-spot instead of general region look.

**Person:** ADHD, extremely visual (prefers Plonk It / Learnable Meta visuals: a photo + a map with the region shaded; objects drawn on a country map), believes in Boyd's law (fast iteration), wants proof he's improving. Do NOT cite Reddit anecdotes to him; he doesn't care.

#### Context you must use
- Research: local://research-perceptual.md, local://research-adhd.md, local://research-geoguessr.md, local://research-fsrs.md. Prior critique: agent://AstraCoach. Earlier brief with screenshot paths: local://system-brief.md (view the screenshots).
- Fieldwork repo: /Users/sethmorton/Desktop/code/fieldwork (branch world-local). Tampermonkey userscript on his own GeoGuessr map; publishes 5 locations per set to his map and starts a game; post-guess cards; FSRS-6; Sprint mode (sprint packs, src/sprint.mjs, tools/world-pack/sprint.py) turns his duel mistakes into cards; `npm run refresh` pulls new duels (tools/world-pack/duels.py, $WORLD_PACK_DATA/duels/rounds.json has 2,528 rounds with country, guess, subdivision, scores). US Vegetation drill (src/vegcard.mjs, EPA ecoregions). tools/world-pack/acow.py samples ACoW-shaped rounds from Vali pools; Plonk It guide texts/images and Learnable Meta metas are cached in WORLD_PACK_DATA (/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work/world-map). His duel losses: Russia regions 36k pts, Brazil 20k, Australia 15k, US 14k. ACoW: top 10 countries 49% of rounds, top 30 80%.
- Read code as needed to make the plan buildable. READ-ONLY: no edits, no commits.

---

## 2. Research: perceptual and category learning

### Perceptual/category learning science for GeoGuessr practice

#### Evidence (claim, number, source, implication)

- **Perceptual-adaptive learning modules (PALMs) give large, durable gains in a few hours.** Dermatology PALM: pre to post on *unseen* images, effect sizes 1.1 to 2.2, still retained at 1 year. This is weak evidence: one institution, self-selected students, no control group. https://pubmed.ncbi.nlm.nih.gov/25592621/ In the ECG PALM, students reached roughly resident-level accuracy in about 1.5 h, and fluency about doubled. Its rules: each category has many exemplars so the same image rarely repeats. At least 3 intervening trials pass before a category recurs. A category is retired after 3 consecutive correct answers, each under 10 to 15 s. https://pmc.ncbi.nlm.nih.gov/articles/PMC6584026/ → *Seth: Sprint should serve fresh panoramas per country or meta, never the same one. Retire an item only when it is both fast and correct.*
- **Interleaving beats blocking for visual categories.** Meta-analysis of 59 studies and 238 effect sizes: overall g = 0.42, paintings g = 0.67, words reverse (g = −0.39). The effect is larger when categories look alike to each other and their members vary a lot. https://pubmed.ncbi.nlm.nih.gov/31556629/ → *Mix confusable neighbors (e.g., Baltics, Andean countries) in one session. Don't drill one country at a time.*
- **Similarity decides interleave vs block.** Interleaving helped high-similarity categories. Blocking helped low-similarity ones. Interleaving highlights the differences between categories, while blocking highlights what members of one category share. https://pubmed.ncbi.nlm.nih.gov/24092426/ → *A brand-new, distinctive meta can get a short block first. Confusable sets should always be interleaved.*
- **You can't trust how learning feels.** 78% of participants learned better with spacing, but 78% rated massing as equal or better. https://web.williams.edu/Psychology/Faculty/Kornell/Publications/Kornell.Bjork.2008a.pdf → *If a mixed session feels worse, that is expected. Judge it by delayed accuracy.*
- **Side-by-side comparison helps.** Case-comparison meta-analysis: d = 0.50 [0.44, 0.56], k = 336 tests. Gains are larger when learners look for similarities and when the content is perceptual. https://eric.ed.gov/?id=EJ1000186 Showing birds in pairs increased the spacing benefit. https://pmc.ncbi.nlm.nih.gov/articles/PMC3085105/ → *Show a miss next to the country he guessed instead (e.g., Mexico vs Guatemala), side by side.*
- **Testing beats restudy.** g = 0.50 [0.42, 0.58]. With feedback g = 0.73, without it g = 0.39. Recall tests are stronger than recognition. Rowland's figures come from secondary sources I read (https://osf.io/download/un87v, https://gwern.net/doc/psychology/spaced-repetition/2021-yang.pdf). The primary abstract is at https://pubmed.ncbi.nlm.nih.gov/25150680/ Testing also helps transfer to new formats: d = 0.40 (Pan & Rickard 2018, cited inside the OSF preprint). Testing improved classification of *novel* bird exemplars. https://pubmed.ncbi.nlm.nih.gov/20804279/ → *Make him guess first and answer from memory, not multiple choice. Never just browse meta sites.*
- **Wrong guesses help, if feedback follows.** Failed retrieval attempts improved later learning. https://pubmed.ncbi.nlm.nih.gov/19586265/ → *Guess on unfamiliar coverage before studying it. Errors are part of the training, not wasted rounds.*
- **Spacing has an optimal gap.** In a study of over 1,350 people, the best gap between reviews was about 20% of the retention interval for delays of a few weeks, falling to about 5% for 1 year. https://eric.ed.gov/?id=ED505660 A synthesis of 839 assessments found the best gap grows as the retention interval grows. https://pubmed.ncbi.nlm.nih.gov/16719566/ → *FSRS already handles this for discrete facts.*
- **Rule-based vs "vibes" categories learn differently.** Delayed feedback hurt similarity (information-integration) learning but not rule-based learning, in an original study and a replication. https://pubmed.ncbi.nlm.nih.gov/12924865/ and https://eric.ed.gov/?id=EJ689184 This is **contested**: the gap can disappear when task difficulty is matched, and it depends on the stimuli. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0313726 → *Give feel-based categories feedback within seconds. Rule-based metas tolerate a batch review afterwards.*
- **Training must be specific, and exposure alone doesn't do it.** Learning to name species, rather than families, transferred better to new exemplars and new species. https://pubmed.ncbi.nlm.nih.gov/15686581/ → *Answer with a region or country, not "somewhere in Europe".*
- **Experts read the whole scene in under a second.** Radiologists and cytologists detected abnormality from 250 to 2000 ms glimpses (d′ ≈ 1 to 1.2, novices ≈ 0.25), without being able to say where it was. https://pmc.ncbi.nlm.nih.gov/articles/PMC3851597/ → *Scene-level "vibes" are a real, trainable skill.*
- **Variety in examples aids generalization.** Variable input makes early learning slower but transfer stronger. This is a narrative review with no pooled effect size. https://pubmed.ncbi.nlm.nih.gov/35577719/

#### Rules

**Discrete metas (bollards, plates, languages, poles):** rule-based learning.
1. Learn the rule explicitly, then switch to recall with answer-first prompts. FSRS spacing fits here.
2. Short block for a new meta, then interleave it with its look-alikes as soon as possible (g ≈ 0.4 to 0.67).
3. Show confusable pairs side by side and name the difference (d ≈ 0.5).
4. Feedback can be batched after the round.

**Holistic scenes (vegetation, soil, road feel, light):** similarity-based learning.
1. Use PALM-style trials: many fresh panoramas, fast country-level answers, a time limit of about 5 to 15 s.
2. Give feedback immediately with the correct answer, and show the right country next to the confused one.
3. Interleave only confusable countries, and vary seasons, cameras and roads within each country.
4. Retire a country only after 3 fast correct answers, spaced across separate trials.
5. Use FSRS for scheduling sessions, but don't treat a single panorama as a "card". The category (the country) is the unit being learned.

[UNVERIFIED] No study has tested these methods on GeoGuessr or Street View itself. Everything here is carried over from medical images, paintings, birds and rocks.

---

## 3. Research: ADHD and practice

### ADHD & practice: evidence → design rules for Fieldwork

Strength: **S** = meta-analysis or replicated. **M** = one or two solid experiments. **W** = small, child-only, or self-report. **None** = no direct evidence found.

#### Memory & scheduling
- **Retrieval practice works the same for ADHD (M, replicated).** 36 ADHD vs 36 matched controls: tested beat restudied (ηp²=.13), and ADHD status didn't change the benefit. Two of three earlier studies agree. Dudukovic 2015 found no benefit. Unmedicated ADHD had worse encoding, explained by fewer deep strategies. [Minear 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10397724/) → *Fieldwork: always ask Seth to guess before showing the answer. Before the reveal, have him name the clue ("bollard type → country") as well as click a country.*
- **More successful recalls → better retention.** Final recall was .07 for items never recalled during practice, .56 for items recalled once, and .90 for three times. [Minear 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10397724/) → *Keep failed cards coming back within the session until he gets one right, then let FSRS space them.*
- **Spacing (S for the general population, none for ADHD).** 839 assessments. The best gap gets longer as the retention interval gets longer. [Cepeda 2006](https://pubmed.ncbi.nlm.nih.gov/16719566/). I found no spacing experiment run on ADHD adults. → *Keep FSRS. The missing ADHD test is no reason to drop it.*

#### Attention & session length
- **Attention drops with time on task (M).** In four 20-min tests, adults with ADHD declined more over time on alertness, selective and divided attention (medium effects, n=29+30). [Tucha 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC5281679/). In children's vigilance tasks the overall gap is large (δ up to 1.34), but the extra decline over time is only small to moderate (δ about .22 to .54). [Huang-Pollock 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3664643/) → *Default to blocks of about 10 to 15 min. Show a per-block accuracy trend and suggest stopping when it falls.*
- **Shorter practice can help ADHD learners (W, n=16+16).** Halving reps from 160 to 80 kept speed gains and removed the overnight accuracy loss. [Fox 2016](https://pubmed.ncbi.nlm.nih.gov/26826465/) → *Cap Sprint sessions. More rounds in one sitting isn't better.*
- **Micro-breaks of 10 min or less (S, general population).** They raise vigor (d=.36) and cut fatigue (d=.35). The overall performance gain is not significant (d=.16), and longer breaks help more. [Albulescu 2022](https://pubmed.ncbi.nlm.nih.gov/36044424/) → *Breaks help mood and persistence. Don't count on them to boost accuracy.*

#### Motivation & feedback
- **People with ADHD discount delayed rewards more (S).** d=.43 across 25 comparisons (N=3,913). [Jackson 2016](https://pubmed.ncbi.nlm.nih.gov/27722208/) → *Make the reward visible every round: streaks, deltas, "mistakes fixed". Don't rely on a slow Elo climb.*
- **Rewards help ADHD performance somewhat more than controls', and strong rewards help most (review of child studies, fairly strong).** 22 studies, N=1,181. [Luman 2005](https://pubmed.ncbi.nlm.nih.gov/15642646/). Feedback alone was enough for controls. For ADHD, only strong incentives (a game version of the task, or €10) kept performance steady over time. €1 didn't. [Dovis 2012](https://pubmed.ncbi.nlm.nih.gov/22187093/) → *For Seth, turning Fieldwork into a game does real work. Mild points probably won't be enough.*
- **Gamification works in general (S).** Effect on learning g=.49 (k=19). Effects on motivation (g=.36) and behaviour (g=.25) are less stable. [Sailer 2020](https://link.springer.com/article/10.1007/s10648-019-09498-w)
- **Caveat on feedback timing (M).** In adults with ADHD, probabilistic cue→outcome learning was impaired with *immediate* feedback but normal with *delayed* feedback. [Gabay 2018](https://pubmed.ncbi.nlm.nih.gov/30341358/) → *Show the correct/incorrect result instantly, then add a short beat with an explanation ("why this was Peru") so he learns the rule consciously.*
- **ADHD gaming performance looks normal (W, n=26+16 children).** Equal to controls in commercial games, impaired on the CPT. [Bioulac 2014](https://pubmed.ncbi.nlm.nih.gov/22628143/) → *Fast, game-like drills are where Seth works best.*
- **Hyperfocus is real but only measured by self-report (W).** It's more common with ADHD and shows up in hobbies and screen time (n=251+372). [Hupfeld 2019](https://pubmed.ncbi.nlm.nih.gov/30267329/). I found no evidence that it improves learning. → *Ride it when it comes, but keep the block cap. Hours of play risk unspaced, fatigued practice. [INFERENCE]*
- **Novelty/variety (none).** I found no ADHD learning study on this, so it's [UNVERIFIED]. Interleaving the review queue (as FSRS already does) is the defensible way to add variety.

#### Load, body, sleep, meds
- **Working memory deficits are moderate in adults with ADHD (S, 38 studies).** [Alderson 2013](https://pubmed.ncbi.nlm.nih.gov/23688211/) → *One clue type per card. Avoid screens with many simultaneous cues.*
- **Exercise before practice (W to M).** Single bouts give children a small gain (g=.17, low-quality evidence). [Zhao 2025](https://pubmed.ncbi.nlm.nih.gov/40604676/). In adults, 30 min of moderate cycling sped flanker RT in ADHD but not controls (n=23+23). [Mehren 2019](https://pubmed.ncbi.nlm.nih.gov/30971959/) → *Optional pre-session walk or ride. Small effect.*
- **Sleep consolidation may fail in ADHD (M, n=26+41).** Controls improved overnight on a visual discrimination skill. Adults with ADHD did not. [Ballan 2022](https://www.nature.com/articles/s41398-022-02239-8) → *Clue-reading is visual perceptual learning, so regular sleep matters more for Seth.*
- **Medication.** It boosts productivity but showed no detectable learning gain (children, N=173 RCT). [Pelham 2022](https://pubmed.ncbi.nlm.nih.gov/35604744/). Medicated adults encoded like controls. Unmedicated adults didn't (W, n=20/16). [Minear 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10397724/) → *Medication won't replace good drill design. If he's medicated, put new-card sessions inside his medicated window. [INFERENCE]*

---

## 4. Research: GeoGuessr expertise, ACoW, deliberate practice

### GeoGuessr expertise: pros, ACoW, deliberate practice

#### Which countries matter on ACoW (official distribution sheet)
- ACoW's distribution sheet, linked from the map page via tinyurl.com/acowdist ([sheet](https://docs.google.com/spreadsheets/d/1AjRLkeEKGFAPOAbXVy7fmrbfVTvstz8opiURgge19RA), [map](https://www.geoguessr.com/maps/668ea3252973190af74233b5)), lists these shares of the sheet total (103,499): **US 9.0%, BR 6.9, IN 5.2, AU 4.9, RU 4.8, CA 4.5, MX 4.3, ID 3.7, AR 3.4, ZA 2.6**. The cumulative share is **top 5 = 30.7%, top 8 = 43.2%, top 10 = 49.3%, top 20 = 68.0%, and top 30 = 79.7%** across 119 countries. Caveat: the map page says "ACoW 2.0" (updated 8/18/2026, 108,804 locs), so the sheet may lag slightly. → Seth: give drills about 80% of their weight to the top 30. **Regionguessing the 7 big countries (US/BR/RU/CA/AU/ID/MX, about 38%) is the main lever.**
- Plonk It's description of ACoW: generated, rural- and dirt-road-weighted, with country weights partly set by "how enjoyable the countries are considered to guess" ([plonkit.net/maps](https://www.plonkit.net/maps)). → Seth: train rural no-move vibes, not urban signs.

#### What pros and guides say works
- Plonk It's practice guide gives these drills: (1) **review every missed round** with the answer known, and compare the true spot with your wrong guess. (2) Ranked play is "generally not a time-effective way to learn." (3) For low-information rounds, play **No Move on rural maps**. (4) For regionguessing, play single countries or Less-Extreme/Extreme Regionguessing maps. (5) For insta-guess pressure, use 10 to 30 s timers. It calls regionguessing big countries the biggest competitive payoff because multipliers grow ([beginners guide](https://www.plonkit.net/beginners-guide)). → Seth: this matches Sprint (mistake review). Add a big-country regionguess drill and a timed variant.
- Plonk It's toolchain: **map-making.app** for coverage checking, its own guides (country ID → regionguess → specific spots), the Regionguessing Meta Library, GeoHints, and geo.emily quizzes ([same](https://www.plonkit.net/beginners-guide)).
- Consus (2023 World Champion) played about **2 to 3 h/day for roughly 2 years, "probably more than 1000 h"**. He refused to force practice ("I don't think it's good for practice"). He built his edge by studying one country deeply (Indonesia house styles and poles) ([interview pt 1](https://medium.com/@romeroesports/this-31-year-old-dutch-player-won-the-geoguessr-world-cup-heres-how-he-got-it-done-part-1-0237162a62b1)). → Seth: short, wanted sessions are fine. Owning one country deeply is a real edge.
- Radu Casapu (2025 World Champion) works top-down: country-specific infrastructure (roads, poles) first, then vegetation and architecture. He says that **writing down his reasoning** made his practice more methodical. Experts scored 96% vs 90% for the best VLM on GeoRC ([GaTech](https://news.gatech.edu/news/2026/07/06/researchers-use-geoguessr-champion-test-geolocation-accuracy-vlms)). → Seth: add a "state your clue" prompt to reviews.
- SamPatt, a high-level player, keeps a **self-made spaced-repetition deck** with hundreds of cards (car blur, antennas, poles, missed locations) and advises against pre-made Anki decks ([HN](https://news.ycombinator.com/item?id=43804197)). Pre-made decks do exist, e.g. a 47-card bollard deck ([AnkiWeb](https://ankiweb.net/shared/info/1131030672)). → Seth: Fieldwork's own-mistake cards match this approach.
- Player reports from Reddit (anecdotal, self-selected): "coverage checking with map maker", spreadsheets built from Plonk It and LearnableMeta, and "**at Angelo's level … car jsons on map-making app and coverage checking**". One player found that analysing rounds made him worse at first, until the rules became automatic ([thread](https://www.reddit.com/r/geoguessr/comments/1u4v2du/how_do_top_geoguessr_players_actually_train_what/)). → Seth: expect a temporary dip after studying.
- Learnable Meta explains the clue **after each guess, in context** ([about](https://learnablemeta.com/about)).

#### How fast people climb (anecdata only, [UNVERIFIED] as data)
- Reports for Bronze to Champion: **4, 5, 6, 8 months (about 10 h/week), and 10 months**. One player stalled at Master I after 7 months and about 5,000 duels of "only duel" play. Others say reaching top 250 takes "6 months of cramming" or 1 to 2 years otherwise, and that "you'll hit a plateau if all you do is play" ([1](https://www.reddit.com/r/geoguessr/comments/1ooqpn8/how_long_did_it_take_you_to_get_from_the_bronze/), [2](https://www.reddit.com/r/geoguessr/comments/1j2e8gm/after_starting_with_geoguessr_how_long_did_it/)). Several report the bar rising over time as the community improves. → Seth: about 6 months of focused study plus play is a plausible Champion timeline. Duel volume alone stalls.

#### Academic work on GeoGuessr
- Berners-Lee (2024, *New Media & Society*) is a **qualitative semiotic analysis of one YouTuber (GeoWizard)**. It describes guessing as recursive back-and-forth between Street View and the map ([paper](https://journals.sagepub.com/doi/full/10.1177/14614448231160132)). It has **no expertise measures and no effect sizes**. I found **no eye-tracking or expert-vs-novice study of GeoGuessr players**.

#### Deliberate practice: how much it can explain
- Macnamara et al. 2014 meta-analysis (157 effect sizes, N > 11,000): deliberate practice explains **26% of performance variance in games**, 21% in music, 18% in sports ([PubMed](https://pubmed.ncbi.nlm.nih.gov/24986855/)).
- Macnamara et al. 2016, sports (63 effect sizes, N = 2,765): r = .43, i.e. **18%** overall. In **elite-only samples it is 1% (r = .11, n.s.)**. Chess players took **3,016 to 23,608 h** to reach master ([PDF](https://artscimedia.case.edu/wp-content/uploads/sites/141/2016/09/14214856/Macnamara-Moreau-Hambrick-2016.pdf)).
- Hambrick et al. 2014: practice explains **34% of reliable variance in chess**. One player reached master in under 2 years, another took 26 ([PDF](https://livrepository.liverpool.ac.uk/3002338/1/Hambrick%20et%20al%20--%20Deliberate%20Practice%20-%20Is%20That%20All%20It%20Takes%20To%20Become%20An%20Expert.pdf)).
- **Contested.** Ericsson (2016) argues these meta-analyses add up any practice hours rather than *optimal* practice, which underestimates the effect ([commentary](https://journals.sagepub.com/doi/abs/10.1177/1745691616635600). I saw the abstract listing only, because the full text returned 403).
- → Seth: practice is the biggest controllable factor, but expect large individual variance and wide time-to-skill ranges. *What* you practise (targeted, feedback-rich, high-frequency countries) matters more than total hours.

---

## 5. Research: spaced-repetition schedulers (FSRS-6/7, neural)

### Schedulers: FSRS-6 vs FSRS-7 vs neural (Nov 2026)

#### Benchmark table
Source: srs-benchmark README, anki-revlogs-10k dataset (about 10k users, about 350M evaluated reviews, per-user means). https://github.com/open-spaced-repetition/srs-benchmark

| Algorithm | Params | LogLoss (no same-day) | RMSE bins | AUC | LogLoss (with same-day) | RMSE bins (same-day) |
|---|---|---|---|---|---|---|
| RWKV-Instant (cross-user NN, extra features) | 2.76M | 0.2773 | 0.0250 | 0.833 | 0.2660 | 0.0321 |
| LSTM | 8869 | 0.3332 | 0.0538 | 0.733 | 0.3140 | 0.0520 |
| GRU | 503 | 0.3328 | 0.0549 | 0.732 | 0.3141 | 0.0536 |
| FSRS-7 recency | 34 | 0.3370 | 0.0593 | 0.722 | 0.3178 | 0.0572 |
| FSRS-7 | 34 | 0.3401 | 0.0634 | 0.717 | 0.3206 | 0.0615 |
| SBD | 7 | 0.3410 | 0.0602 | 0.715 | 0.3218 | 0.0586 |
| FSRS-6 | 21 | 0.3460 | 0.0653 | 0.703 | 0.3842 | 0.0985 |
| FSRS-7 default params (no per-user fit) | 0 | 0.3620 | 0.0910 | 0.703 | 0.3399 | 0.0895 |
| AVG (constant baseline) | 0 | 0.3945 | 0.1034 | 0.500 | 0.3816 | 0.1195 |
| SM-2 / Anki-default | n/a | not in current README table [UNVERIFIED] | | | | |

- **What changed from FSRS-6 to FSRS-7.** FSRS-7 handles fractional (sub-day) intervals and is the only version with realistic same-day recall predictions. Its forgetting curve has 8 optimizable params (34 total vs 21) and mixes two curves, with an added short-term stability state. Sources: README above, and Schill 2026 section 2.4 https://arxiv.org/html/2610.10548v1. *Implication: this matters if Sprint repeats cards within the same day.*
- **Size of gain.** For day-scale reviews, FSRS-6 to FSRS-7 recency cuts log loss 2.6% (0.3460 to 0.3370) and raises AUC by 0.019. With same-day reviews included, log loss drops 17% (0.3842 to 0.3178), and FSRS-6 there is barely better than the constant AVG baseline on RMSE. *Implication: small gain for day-spaced reviews, large gain for intra-day repeats.*
- **Small-data caveat.** FSRS-7 with default params (0.3620) is worse than per-user-fitted FSRS-6 (0.3460) at day scale. Much of the gain comes from per-user fitting, which is weak with a few hundred reviews. *Implication: the version matters less than having enough reviews to fit.* [INFERENCE: behaviour at a few hundred reviews is not directly reported. The README's metric_over_size notebook was not read.]
- **Neural models.** LSTM and GRU beat FSRS-7 recency by only about 1% log loss. RWKV-Instant is far better (0.277), but it is trained across 5k users with extra features (answer time, deck structure, sibling info) and is not fit per user. The README warns it "may predict that the probability of recall will increase over time", so it has no usable forgetting curve. *Implication: not deployable in a userscript and hard to schedule from.*
- **Reviews saved.** I found no source that converts these log-loss deltas into reviews saved at fixed retention [UNVERIFIED]. Schill (arXiv 2610.10548) says A/B tests between state-of-the-art schedulers are "absent from the spaced repetition literature". He also argues test-set accuracy is "necessary but not sufficient" because the data come from existing schedulers (Lucas critique). *Implication: the practical savings from 6 to 7 have not been measured.*
- **arXiv 2610.10548 (Schill, Sep 2026).** SBD uses 7 params and 3 states. Fine-tuned BCE is 0.3279 vs 0.3237 for FSRS-7 (about 1% worse) with 80% fewer weights. Pretrained-only SBD beats FSRS-7 on RMSE bins by 2%. The paper gives a Whittle-index policy for daily review budgets. *Implication: simple models nearly match, and extra complexity buys little.*
- **Release status.** ts-fsrs 6.0.0 (2026-10-28) makes FSRS-7 the default model for DefaultScheduler (https://github.com/open-spaced-repetition/ts-fsrs/releases). In Jun 2026 an Anki forum thread said FSRS-7 was not yet released (https://forums.ankiweb.net/t/when-will-anki-integrate-fsrs-7/69997). Whether Anki 26.09 ships it is [UNVERIFIED]. *Implication: a drop-in upgrade path exists for a JS userscript.*
- **Reddit post (r/Anki 1w0p9qc).** Reddit blocked access (403 and login wall). From search snippets only, the title is "After ~6 months of work on my Fork, integrating FSRS7 and RWKV, a neural network to predict retrievability". The body notes that once integrated into Anki it must work with "learning steps, stats, undo, sync, filtered decks, mobile compatibility, large collections". Any performance claims in the post are [UNVERIFIED].
- **Perceptual cards.** The benchmark uses Anki decks, mostly text. I found no evidence on image or perceptual-category cards [UNVERIFIED]. GeoGuessr skill means generalizing to new locations, which is different from recalling one item. Per-item retrievability may be the wrong target. [INFERENCE]

#### Verdict
Switching Fieldwork from FSRS-6 to FSRS-7 is cheap (ts-fsrs v6). It is worth doing only if Sprint or drills repeat cards within a day, because that is where FSRS-6 is badly calibrated (17% worse log loss). For day-spaced review the gain is about 2 to 3% log loss. Nobody has measured it in reviews saved, and with only a few hundred reviews the fitting noise outweighs it (default-param FSRS-7 does worse than fitted FSRS-6). A neural model is not worth it. Per-user LSTM and GRU gain very little, and RWKV needs cross-user training data that Fieldwork does not have. Seth's time is better spent on what and how he drills than on the scheduler.

---

## 6. Astra critique (gpt-6-astra)

#### 1. Core visual unit: a feature map connected to real scenes

**Keep Seth’s remembered Brazil pole map as the model.** His preference is concrete evidence about what he remembers, although it does not prove transfer to unseen roads.

**[INFERENCE] All designs and timings below are proposed experiments, not validated GeoGuessr prescriptions.**

The unit should be **one visual distinction, its geographic distribution, and varied panorama examples**.

| Screen | What appears, in order | Timing |
|---|---|---|
| Study | Country map with supported versus unsupported pole drawings placed over their distributions. Two linked panorama examples. Feature name and short caveat only. | 60 to 90 seconds initially |
| Drill | Fresh rural panorama plus an ordinary guess map. Hide the distribution overlay. Seth pins before seeing the answer. | Start at 15 to 20 seconds. Add 10-second rounds after accuracy improves. |
| Miss card | Same distribution map, now with actual location and Seth’s pin. Keep the missed panorama large. Highlight one relevant feature. Add a look-alike example from his guessed region only when useful. | About 5 to 10 seconds, self-paced |
| Later retrieval | Another panorama from a different road, requiring the same distinction. | After intervening trials and on later days |

Screenshot 2 links objects to geography. Screenshot 3 links a whole scene to a region. Combine those strengths. Screenshot 1 already has comparisons, but its species lists, numbered boxes, and competing images bury the lesson.

Distribution maps need exceptions and transition areas where supported. Do not turn “common here” into “exclusive here.” For terrain and vegetation, preserve the whole scene rather than demanding one diagnostic object.

Comparison, varied examples, and retrieval support this approach. Direct GeoGuessr evidence is absent. [research-perceptual.md](local://research-perceptual.md)

#### 2. Replace three compulsory lanes with one focus and one choice

- **One weekly focus:** a specific confusion, such as two Brazilian regions, rather than “Brazil.”
- **One optional curiosity slot:** Seth chooses a map or region that interests him.
- **Mixed maintenance:** short returns to earlier material, without presenting another obligation.
- **Progress map:** show practiced areas and dated fresh-test results. Leave untested areas neutral, not alarming.

Do not automatically assign Russia because its raw damage total is largest. Exposure, multipliers, opponents, and a few catastrophic rounds can distort that ranking. Use country frequency and ordinary score deficit per encounter, with sample counts, to suggest priorities.

Replace graduation with **reduced frequency after delayed success on unfamiliar roads**, then occasional checks. Three quick correct answers are not durable regional mastery.

ADHD research supports shorter sessions and timely rewards. It does not establish an optimal lane count or novelty schedule. Choice is a motivation hypothesis to test with Seth. [research-adhd.md](local://research-adhd.md)

#### 3. Why the US plateau probably happens

| Evidence or hypothesis | Response |
|---|---|
| Reported 84% repeated-panorama versus 50% fresh accuracy | Train different roads, seasons, and camera conditions. Repetition accuracy cannot establish transfer. |
| Reported first-look accuracy halves after about 30 minutes | Stop before that decline. Do not prescribe 30 minutes of drills followed immediately by duels. |
| **[INFERENCE]** Vegetation-only training misses other useful information | Study separate terrain, soil, road, and infrastructure maps, then combine them in mixed panoramas. |
| **[INFERENCE]** EPA boundaries overstate visually meaningful differences | Retain ecoregions as reference layers. Grade localization continuously in distance and points, not solely by polygon membership. |

The US is also 9% of the supplied ACoW distribution, so abandoning it is unnecessary. Narrow the confusion instead of grinding “the US.” [research-geoguessr.md](local://research-geoguessr.md)

#### 4. Browsing and map study deserve a real role

**Yes to map-led study. No to unlimited exposure as the entire method.**

The Chaco screenshot shows a route through geography, useful for seeing continuity and transitions. It does not demonstrate learning gains.

Use: **two guesses → study one distribution map → short tour across contrasting locations → fresh guesses with the overlay hidden.** Predict the next landscape during the tour. Avoid collecting twenty adjacent views that teach one road.

Maps supply an organized explanation. Quizzes test whether Seth can use it without the explanation visible. Retrieval outperforming restudy does not mean initial study is worthless. [research-perceptual.md](local://research-perceptual.md)

#### 5. Routine and proof within two weeks

| When | Routine |
|---|---|
| Daily, 12 to 15 minutes | Two warm-up guesses, 2 minutes studying one feature map, 7 minutes fresh mixed panoramas with immediate mapped feedback, 2 minutes spaced recall. |
| Optional later | Curiosity tour or duels after a break. Refresh afterward. |
| Weekly | Review results and choose one focus. Revisit the same feature map using new roads. |

**Measurement:** baseline, day 7, and day 14 use separate unseen road sets, matched country/region proportions, timer, and no-move rules. Reserve roughly 30 rounds per checkpoint, split into short blocks. Hide feedback until each block ends.

Track mean ordinary score deficit, median distance, country accuracy, and response time. Show sample counts and uncertainty. Improvement must appear on unseen locations without simply taking longer. Small samples may remain inconclusive.

Reject a guaranteed “−120 points this week” reward. Celebrate completed practice immediately. Claim improvement only when measured.

#### 6. Fieldwork’s first three changes, smallest-first

1. **Simplify the miss card:** one existing feature map, two pins, one panorama, optional comparison.
2. **Record transfer evidence:** seen/unseen status, road identity, response time, score, and checkpoint results.
3. **Add a map-led practice sequence:** study, fresh-road drill, mapped feedback, delayed revisit.

Keep FSRS-6 for discrete facts. Scheduler prediction gains have not established GeoGuessr learning gains. [research-fsrs.md](local://research-fsrs.md)

---

## 7. Design: Sonnet A (session flow, ADHD engagement)

### Training system for Champion by Nov 14 (design A)

Verdict: one 150-minute day made of 12-minute blocks, with a fresh-spot supply built from the Vali pools Seth already has. Day 1 is usable after about 3 hours of build. Items marked [INF] are my inferences, not tested.

#### 1. Daily session (150 min, 120 min counts as "banked")

| Min | Block | What happens |
|---|---|---|
| 0 to 10 | **Cold exam** | 20 fresh world rounds, 15 s, no cards. Only a flash: country right or wrong, km, streak. This is the daily benchmark. |
| 10 to 32 | **Focus sandwich** | Pretest 8 fresh spots. Then 2 feature maps (60 s each) and 1 look strip (45 s). Then 14 drill rounds with miss cards. Then posttest 8. The block ends on a pre-to-post bar. |
| 32 to 44 | **Blitz** | 20 rounds at 10 s. Confusable neighbours are over-weighted (research-perceptual: interleave look-alikes). |
| 44 to 52 | **Same place, new road** | Take the top 3 regions he missed today. Show a look strip for each, then one fresh spot from each region, never the missed panorama. |
| 52 to 60 | Break | Walk. |
| 60 to 90 | **Ranked duels** | Up to 3 duels. Two losses in a row means switch to Blitz [INF: tilt]. |
| 90 to 102 | **Long-tail Blitz** | Countries ranked 11 to 60 by ACoW weight, so the whole world is covered. |
| 102 to 118 | **Focus return** | A different feature map of the same focus, then 10 drill rounds and 6 test rounds. This is a second spaced exposure on the same day. |
| 118 to 122 | Break | |
| 122 to 150 | **Wildcard** | His choice of map or country: look-map tour, 5 spots, then free play. He ends on something he picked. Then `npm run refresh`. |

**Reward loop (research-adhd: ADHD discounts delayed rewards, and a game-like task keeps performance up):**
- Every round shows an instant country streak and a km delta against his 30-day average for that country.
- Every block ends with one number and an arrow against the same block yesterday.
- The home screen is a fog-of-war world map. A region lights up after 3 or more fresh-spot hits, so progress is visible.

**Stopping rules:**
1. No "one more" inside a block. Blocks end at their time or round cap.
2. A fatigue gate applies between blocks. If 2 drill blocks in a row fall below 85% of the cold-exam hit rate, drilling stops for the day. His own data shows first-look accuracy halves after about 30 min (win/LearnSeth.md).
3. Hard cap of 3 h. A hyperfocus bonus Blitz is allowed only after a 5-minute break, at most twice (research-adhd).

**Changes over the 12 days:**

| Days | Change |
|---|---|
| D1 to 2 (Nov 3 and 4) | 20 s timers. Focus blocks run 25 min. D1 cold exam is 40 stratified rounds. |
| D3 to 9 | Timers drop to 15 s, then 10 s once the last 3 days of block hit rate are at least 80%. D6 has a 60-round checkpoint. |
| D10 to 11 | Taper. No new focus. Duels grow to 60 min. D11 is the final 60-round exam. |
| D12 (Nov 14) | Duels plus a 5-minute warm-up only. |

#### 2. Screens

```svg
<svg viewBox="0 0 720 230" width="100%" fill="none" stroke="currentColor" font-size="11">
  <g transform="translate(5,5)"><text x="0" y="12" fill="currentColor" stroke="none">DRILL</text>
    <rect x="0" y="20" width="210" height="150" rx="6"/><rect x="0" y="20" width="140" height="5" fill="var(--accent)" stroke="none"/>
    <rect x="148" y="118" width="58" height="48" rx="4"/><circle cx="178" cy="142" r="3" fill="var(--error)" stroke="none"/>
    <text x="8" y="190" fill="currentColor" stroke="none">flash: right, 212 km, streak 14</text></g>
  <g transform="translate(245,5)"><text x="0" y="12" fill="currentColor" stroke="none">MISS CARD</text>
    <rect x="0" y="20" width="130" height="90" rx="6"/><rect x="40" y="55" width="26" height="18" stroke="var(--c2)"/>
    <path d="M145 30h60l8 35-18 40h-50z" fill="var(--c1)" fill-opacity=".35"/><circle cx="175" cy="60" r="3" fill="var(--success)" stroke="none"/><circle cx="150" cy="95" r="3" fill="var(--error)" stroke="none"/>
    <rect x="0" y="122" width="48" height="36"/><rect x="52" y="122" width="48" height="36"/><rect x="112" y="122" width="48" height="36" stroke="var(--error)"/><rect x="164" y="122" width="48" height="36" stroke="var(--error)"/>
    <text x="0" y="180" fill="currentColor" stroke="none">true strip | your-guess strip</text></g>
  <g transform="translate(485,5)"><text x="0" y="12" fill="currentColor" stroke="none">FEATURE MAP</text>
    <path d="M10 40l70-15 90 20 30 60-40 70-90 10-60-60z"/><path d="M30 60l50-12 20 50-40 30z" fill="var(--c3)" fill-opacity=".4"/><path d="M110 70l60 10 20 40-50 30z" fill="var(--c4)" fill-opacity=".4"/>
    <rect x="45" y="75" width="22" height="18"/><rect x="130" y="95" width="22" height="18"/><path d="M67 84l30 10M152 104l-30 20"/></g>
</svg>
```

**Drill screen:**
- The panorama, a timer bar and the native guess map.
- After the pin, a 1.5 s flash: country right or wrong, km, points, streak. Nothing else.

**Miss card:** a miss means wrong country or more than 800 km off. It shows three objects and at most 6 words.
1. His panorama, with one boxed feature.
2. A mini-map with the true region shaded, his pin, and a line between them.
3. One compare strip: 3 thumbnails of the true region next to 3 of the region he guessed (research-perceptual: side-by-side comparison, d about 0.5). The strips are new thumbnails every time.

Any key advances the card, and it auto-advances after 8 s.

**Study screen:**
- **Feature map:** the country with one feature. Each region is shaded and carries a photo of its variant, with an arrow. It shows at most 4 variants and a caption of 6 words or fewer.
- **Region look map:** at most 6 regions. Each region has a strip of 4 typical panoramas. Tapping a region cycles in 4 new ones, so he sees variety, not one photo.
- In both, the overlay hides at the pretest.

#### 3. Location supply (about 150 fresh spots per day, so about 1,800 over 12 days)

- **Pool:** `$WORLD_PACK_DATA/gap/pools/<CC>-locations.json` holds 50,927 Vali panoramas across 127 countries. Each has a `panoId`, a heading and an admin-1 tag in `extra.tags`. Examples: US 2,254, BR 1,071, RU 1,266.
- **More on demand:** call `gapfill.vali_pool(cc, goal)` with a larger goal. Vali and 43 GB of data are local. Dedupe against the ledger afterward [INF: the larger pool overlaps the old one].
- **ACoW shape:** `acow.weights()` gives the country weights, and `acow.urban_shares()` gives the rural quota (87% rural).
- **Rural filter:** `rurality.py` labels the day's roughly 400 candidates (12 images per call, resumable). Keep the rural ones.
- **Liveness:** `collect.thumb()` returns None for a blank thumbnail. Skip those panoramas. `win/dead-panoramas.json` is a second list.
- **Never repeats:** a new `fresh/ledger.json` holds every `panoId` ever served, plus every `view.panoId` in `duels/rounds.json` (2,528 rounds) and every pack location. The exam and test spots are drawn from the same ledger.
- **Region look strips:** group pool panoramas by `extra.tags`. Take 6 rural ones per region, and add them to the ledger so they are never played later. Thumbnails already exist in `thumbs/` (121,922 files).
- **Region shapes:** `fieldwork-site/globe/admin1/<ISO2>.json` covers 105 countries, and `src/world-geometry.json` has the outlines.
- **Feature maps:** use the Learnable Meta data. `lm/exports.jsonl` has 5,795 metas with author-placed lat/lng, and `sprint/decks/*.json` groups them by country. `gap/clue-regions.json` (3,471 clues) gives subdivisions, and the Plonk It images are in `refs/`. Draw a blob per meta from its points, add one photo icon per meta, and add a 6-word caption.
- **Delivery:** `tools/world-pack/fresh.py` writes a pack with the day's panoramas in block order. The userscript then publishes 5 at a time through the existing `publishPracticeSet`, and `gameSettings.timeLimit` sets the 15 s timer (validated in `validatePack`).

#### 4. Deep focus

Score each country as:

$$F = \text{ACoW share} \times \frac{\sum \max(0,\ \text{their} - \text{my score}) + 10 \cdot 502}{n + 10}$$

Here 502 is his global mean points-behind per round, so small samples are pulled toward it. I ran this on `duels/rounds.json`:

| Country | F (points per ACoW round) |
|---|---|
| US | 59 |
| BR | 41 |
| CA | 30 |
| ID | 25 |
| RU | 24 |
| AU | 24 |
| IN | 23 |

- Russia drops to fifth once frequency is normalised, so it is not the raw-damage leader.
- The focus unit is 3 to 4 confusable admin-1 regions inside the winning country, scored by the same formula with shrinkage toward the country mean.
- **Day 1 audition:** the D1 cold exam gives each of the top 6 countries at least 6 fresh rounds. Pick the focus from those fresh rounds, which are cleaner than duel data.
- **Switching:** re-score every night after `npm run refresh`. Keep a focus for at least 3 days, so it gets spaced revisits. Switch when posttest and next-day cold results hit the world average, or when 3 days of gain are under 150 points.
- A retired focus gets double weight in Blitz for 2 days.

#### 5. Measurement (all on unseen spots)

- **Home screen:** three numbers.
  - The cold-exam 3-day average, shown as hit rate and median km.
  - The focus ladder: pretest, posttest, next-day cold, all on fresh spots, with the sample size shown.
  - Duel points per round by country, before and after, from `refresh`.
- **Control:** the studied region is compared against unstudied regions in the same cold exam. This is a difference-in-differences check.
- **Noise (my calculation):** his score SD is 1,474 per round. 60 rounds give a standard error of about 190, so a 12-day change at world level under about 500 points cannot be proved. A single day's pre-to-post delta on 8 spots is noise.
- **What I will claim:** the focus region should show a pooled 3-day gain with a confidence band and n. That is the proof. Streaks and block arrows are motivation, not evidence.

#### 6. Build plan (effort is [INF])

| # | Build | Effort | Result |
|---|---|---|---|
| 0 | `fresh.py`, the ledger, a 'queue' scheduler in `next-set.mjs` (next 5 unserved panoramas), `gameSettings` 15 s NoMove, auto country grading (already exists) | 3 h | **Day 1 is playable: Blitz plus cold exam.** |
| 1 | Log score, km, time, block and region. Extend `sessionBar` with streak and block arrow. | 2 h | Reward loop and measurement data. |
| 2 | Miss card v2, plus `strips.json` and thumbnail prefetch in the installer. | 3 h | Fixes the skipped-card problem. |
| 3 | `focus.py`: nightly formula, pre and post test spots, block order. | 3 h | Focus engine. |
| 4 | `featuremap.py` for the top 10 countries from LM exports and `clue-regions`. | 4 h | Plonk It style maps. |
| 5 | Home fog-of-war map and measurement panel, reusing `fieldwork-site/globe/app.js`. | 3 h | Visible proof. |

Until step 4 lands, use the existing Globe (`fieldwork-site/globe`) for study screens. I have not checked what it renders.

---

## 8. Design: Sonnet B (visual screens)

### Design B: fresh-spot loop, boards, three-beat miss card

Every drill round is a spot Seth has never seen, so every round is also a test. Boards and cards teach the region with new panoramas, never the photo he just missed.

#### 1. Daily session (145 min, 120 of play)

| Min | Block | Content |
|---|---|---|
| 0 to 10 | Probe | 20 unseen ACoW-weighted rounds, 20 s, no focus bias. Lite card only (map and region name). This is the measurement. |
| 10 to 25 | Focus A | 3 pretest rounds in the focus country, a Look board (45 s), then about 20 rounds at 15 s |
| 25 to 30 | Break | Away from the screen |
| 30 to 45 | World mix A | About 35 rounds at 15 s, ACoW weights, confusable countries adjacent |
| 45 to 50 | Break | |
| 50 to 65 | Feature block | 3 Feature maps (30 s each) from his miss stack, then 4 unseen test rounds after each |
| 65 to 70 | Break | |
| 70 to 85 | Focus B | A different cluster of the focus country, about 25 rounds |
| 85 to 100 | World mix B | About 35 rounds, the last 10 at 10 s |
| 100 to 110 | Break | `npm run refresh` pulls the new duels |
| 110 to 145 | Duels | 2 to 3 ranked games, hard stop |

- The probe goes first because his first-look accuracy falls from 63% to 31% across a long sitting (LearnSeth.md §2). Blocks stop at 15 min (research-adhd.md).
- **Days 1 to 3:** baseline. Focus is whatever the formula picks on day 1.
- **Days 4, 7, 10:** the focus is re-picked.
- **Days 10 to 12:** taper. The Feature block becomes a third world mix. Day 12 has no new boards, only probe, mix and duels.
- **Retests:** each miss brings back a fresh spot of that region at least 3 rounds later, then next day, then after 3 days (research-perceptual.md ECG rules). A region stops returning after 3 fast correct answers on unseen spots.

#### 2. Screens

```svg
<svg viewBox="0 0 760 252" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="10" fill="currentColor">
<text x="8" y="14" font-weight="bold">FEATURE MAP: Brazil poles</text>
<path d="M80 36 L134 30 L176 60 L172 118 L146 176 L108 206 L84 164 L66 108 Z" fill="none" stroke="currentColor"/>
<path d="M80 36 L134 30 L146 68 L90 74 Z" fill="var(--c1)" fill-opacity=".4"/>
<path d="M90 74 L146 68 L176 60 L172 118 L100 118 Z" fill="var(--c2)" fill-opacity=".4"/>
<path d="M100 118 L172 118 L146 176 L108 206 L84 164 L66 108 Z" fill="var(--c3)" fill-opacity=".4"/>
<line x1="40" y1="64" x2="100" y2="52" stroke="var(--c1)"/>
<rect x="4" y="44" width="36" height="42" rx="3" fill="none" stroke="var(--c1)" stroke-width="2"/>
<line x1="22" y1="50" x2="22" y2="80" stroke="var(--c1)" stroke-width="3"/>
<line x1="204" y1="96" x2="150" y2="94" stroke="var(--c2)"/>
<rect x="204" y="74" width="36" height="42" rx="3" fill="none" stroke="var(--c2)" stroke-width="2"/>
<line x1="222" y1="80" x2="222" y2="110" stroke="var(--c2)" stroke-width="3"/>
<line x1="40" y1="170" x2="100" y2="160" stroke="var(--c3)"/>
<rect x="4" y="150" width="36" height="42" rx="3" fill="none" stroke="var(--c3)" stroke-width="2"/>
<line x1="22" y1="156" x2="22" y2="186" stroke="var(--c3)" stroke-width="3"/>
<text x="8" y="236" fill="var(--muted)">one 10-word note, only for a trap</text>
<g transform="translate(258,0)">
<text x="0" y="14" font-weight="bold">LOOK BOARD: Russia</text>
<g stroke="var(--c1)" fill="none" stroke-width="2"><path d="M0 52 L30 44 L36 70 L8 78 Z" fill="var(--c1)" fill-opacity=".4"/><rect x="46" y="44" width="42" height="30"/><rect x="92" y="44" width="42" height="30"/><rect x="138" y="44" width="42" height="30"/><rect x="184" y="44" width="42" height="30"/></g>
<text x="46" y="38">Volga</text>
<g stroke="var(--c2)" fill="none" stroke-width="2"><path d="M0 112 L30 104 L36 130 L8 138 Z" fill="var(--c2)" fill-opacity=".4"/><rect x="46" y="104" width="42" height="30"/><rect x="92" y="104" width="42" height="30"/><rect x="138" y="104" width="42" height="30"/><rect x="184" y="104" width="42" height="30"/></g>
<text x="46" y="98">Urals</text>
<g stroke="var(--c3)" fill="none" stroke-width="2"><path d="M0 172 L30 164 L36 190 L8 198 Z" fill="var(--c3)" fill-opacity=".4"/><rect x="46" y="164" width="42" height="30"/><rect x="92" y="164" width="42" height="30"/><rect x="138" y="164" width="42" height="30"/><rect x="184" y="164" width="42" height="30"/></g>
<text x="46" y="158">Siberia</text>
<text x="0" y="236" fill="var(--muted)">Space: reshuffle strips</text>
</g>
<g transform="translate(516,0)">
<text x="0" y="14" font-weight="bold">MISS CARD: 3 beats</text>
<text x="0" y="40" fill="var(--accent)">1</text>
<path d="M30 28 L70 24 L84 50 L66 78 L40 70 Z" fill="none" stroke="currentColor"/>
<path d="M50 52 L66 50 L64 66 L50 66 Z" fill="var(--error)" fill-opacity=".5"/>
<circle cx="34" cy="38" r="3" fill="var(--accent)"/>
<line x1="34" y1="38" x2="56" y2="58" stroke="var(--accent)"/>
<text x="100" y="46">Santa Catarina</text><text x="100" y="62" fill="var(--muted)">-1,240 km</text>
<text x="0" y="116" fill="var(--accent)">2</text>
<rect x="16" y="98" width="34" height="26" fill="none" stroke="currentColor" stroke-dasharray="3 2"/>
<g fill="none" stroke="var(--c1)" stroke-width="2"><rect x="58" y="98" width="42" height="26"/><rect x="104" y="98" width="42" height="26"/><rect x="150" y="98" width="42" height="26"/><rect x="196" y="98" width="42" height="26"/></g>
<text x="58" y="92">Santa Catarina looks like this</text>
<text x="0" y="176" fill="var(--accent)">3</text>
<g fill="none" stroke="var(--muted)" stroke-width="2"><rect x="16" y="158" width="42" height="26"/><rect x="62" y="158" width="42" height="26"/><rect x="108" y="158" width="42" height="26"/><rect x="154" y="158" width="42" height="26"/></g>
<text x="16" y="152" fill="var(--muted)">Your pin: Goias (wrong region only)</text>
<text x="0" y="236" fill="var(--muted)">auto 4 s, any key skips, 12 words max</text>
</g>
</svg>
```

- **Feature map (Plonk It).** One country and one feature with at most 4 variants, so it works as a map. Regions are tinted by variant colour, with one photo sticker per variant on a leader line (his Brazil pole map).
  - Text is a 3-word title plus an optional 10-word trap note ("Paraguay too").
  - It has no legend, species list or paragraph.
  - A click on a sticker shows 2 unseen examples.
  - Features that are nationwide get no map.
- **Region look map (Learnable Meta).** The Look board shows 3 or 4 regions of one country, or confusable neighbours. Each row is a mini map with the region shaded, then a strip of 4 random unseen panoramas. The only text is the region name.
  - The strips are random, not hand-picked, so they are an honest sample of what he will meet.
  - Space reshuffles them, so no strip becomes a photo to memorise.
- **Drill.** Native GeoGuessr, NoMove, 15 s (`pack.gameSettings.timeLimit`). It adds a small HUD (round n/35, streak, block clock) and no hints before the guess. A hit gets a 1 s green flash and the score. Only misses get a card.
- **Miss card.** It has three beats, one object each. The old veg card had 14 objects at once.
  - Beat 1 is the result map with the truth region, his pin and the km.
  - Beat 2 is a strip of new truth-region panoramas, with his missed frame small at the left.
  - Beat 3 appears only for a wrong region and shows a grey strip of his pin's region.
  - If a clue label exists (`duels/classified.jsonl`), one chip queues that Feature map for the Feature block. It never opens mid-drill.

#### 3. Location supply

Existing pieces:
- `gapfill.vali_pool(cc, goal)` runs Vali on `~/vali-data` (127 countries). It writes `gap/pools/<CC>-locations.json`, tagged by subdivision. There are 50,927 spots now (US 2,254, BR 1,071, RU 1,266).
- `acow.weights()` gives country shares, and `acow.urban_shares()` calibrates how rural the spots are.
- `collect.thumb(view, fov)` makes 640x400 thumbnails with no API key.
- `win/stats-confusion.json` and `sprint_contrast.py` give the confusable pairs.

Seth needs about 150 rounds a day, about 1,800 over 12 days. The US needs about 165 of its 2,254 spots.

A new `deal.py` does three things:
1. It keeps a ledger, `seen.json`, of panoIds from `duels/rounds.json` (2,528), `sprint/pack.json` (3,072), the LM exports, and every spot it has dealt.
2. It splits each subdivision pool 50/50 by hash into DRILL and STUDY halves. Boards and cards draw only from STUDY, so a strip never leaks into a drill round.
3. It regenerates the 8 biggest countries at 5,000 spots each, with a low-building filter and the ledger as Vali's used-locations list. [INFERENCE: the Vali GUI lists a global filter (example `Buildings200`) and used-locations paths, but I did not verify the JSON key names. Try `vali create-file`.] The fallback is `rurality.py`.

The result is ACoW-like, not ACoW, because ACoW cannot be exported.

#### 4. Deep focus

`focus(c) = ACoW share(c) × (Σ gap + 10·μ) / (n + 10)`

- `gap` is the opponent's score minus his score per round, from `rounds.json`.
- `μ` is his mean gap.
- Fresh drill rounds count double.
- I use the gap rather than raw loss because raw loss just ranks big countries. [INFERENCE]
- I ran it on his 2,528 rounds: US 11.3, CA 3.9, NA 3.7 (n=8, weak), TH 2.5.
- Inside the focus country the same formula (shrink 5) ranks admin-1 units. Look-board clusters are macro-regions, such as Brazil's 5 regions, Russia's 8 federal districts and US census divisions. [INFERENCE]
- It is re-picked on days 4, 7 and 10. It also switches early when the focus gap is 0 or lower over its last 30 unseen rounds.

#### 5. Measurement

Because every drill round is on an unseen spot, nothing is inflated by repeats (84% on repeats vs 50% on new, LearnSeth.md §2).

The home screen shows three tiles, each with n and a 95% band:
1. Country hit rate.
2. Points per round.
3. Fix rate, the share of misses where a fresh spot of the same region, 3 or more rounds later, is hit. It updates every few minutes, which is his fast loop.

Power: his round-score SD is 1,470 and his ACoW wrong-country rate is 32% (n=843, `rounds.json`). Probe plus mix gives 180 rounds per 3 days. Days 10 to 12 against days 1 to 3 can therefore detect about 300 points or 10 points of country rate. The daily number is noise of about ±330 points, so it is drawn dotted. Smaller gains will not show.

Focus is measured as points per round on unseen focus spots, first 15 against last 15 of each period, next to the non-focus mix. Duels use the same tiles after `refresh`.

#### 6. Build plan

| # | Build | Effort |
|---|---|---|
| 1 | `deal.py`: ledger, drill/study split, daily pack (probe, mix, focus blocks, spare spots per region), focus formula | 2 h |
| 2 | `scheduler:'deal'` in `validatePack` and `makeNextSet`: next 5 unplayed spots, with a miss pulling spares for the retest | 1 h |
| 3 | `lookcard.mjs`: 3 beats, inset map from pre-projected admin-1 paths (`globe_geometry.py`), `serve.mjs` image root, thumbnail prefetch | 3 h |
| 4 | `boards.py`: one HTML Look board page per block | 1.5 h |
| 5 | Scoreboard tiles with bands and fix rate | 2 h |
| 6 | `featuremaps.py`: group `study/<country>.json` skills by country and `practiceFamily`, regions from `gap/clue-regions.json`, sticker from `imageUrls[0]`. Hand-fix the first 8, Brazil poles first. | 5 h |
| 7 | Focus re-pick in `refresh.sh`, prefetch of the next set | 1 h |

After rows 1 and 2 (about 3 h), probe, mix, focus and duels run on GeoGuessr's own result screen. After rows 1 to 4 (about 7.5 h), day 1 has cards and boards. Row 5 is needed by day 2 and row 6 by day 3.

---

## 9. Design: Sonnet C (mental model of regions)

**Core idea.** Seth learns a *look zone* (4 to 7 per big country, solid core plus faded edge), not a photo. The loop per zone is: blind guess, map plus a strip of 8 different spots, fresh guess, then interleave with neighbor zones. Zones come from the Köppen climate grid (0.5°, koeppen-geiger.vu-wien.ac.at/present.htm). The US uses the EPA level II regions already in usveg. [INFERENCE: Köppen approximates "looks alike", so eyeball each map once.] Why: in his 861 ACoW duel rounds (duels/rounds.json), 70 to 84% of points lost in US, BR, RU and AU are inside the country.

#### 1. Daily session (130 min, 120 active)
| Min | Block | Content |
|---|---|---|
| 0-3 | Today | yesterday's number, focus |
| 3-23 | A. Cold world mix | 60 fresh spots, ACoW-weighted, 12 s. Scored block (first-look accuracy halves after about 30 min) |
| 23-43 | B. Focus loop x2 | each 10 min: 3 blind rounds in focus zones (guess before study), study screen 90 s, border walk or feature map 60 s, 6 fresh rounds mixing focus zone and neighbor |
| 43-48 | Break | |
| 48-68 | C. World tour | 5 zones from least-seen countries: 3 blind rounds, look map 60 s, 3 fresh rounds |
| 68-73 | Break | |
| 73-93 | D. World mix II | 60 fresh spots, 10 s, 25% spaced returns to earlier zones (new spots) |
| 93-125 | E. Ranked duels | real test |
| 125-130 | Refresh | `npm run refresh`, duel misses become look cards |

**It changes:**
- Nov 3-5 Cover: A is exam 1. Tour shows one overview map per top-30 country (10 a day), no strips.
- Nov 6-10 Contrast: tour becomes border walks for the 5 most confused zone pairs. Exam 2 replaces A on Nov 8.
- Nov 11-13 Speed: timers 12 to 8 s, no blind pretests, duels 45 min. Exam 3 on Nov 12.
- Nov 14: A cold, then ranked.

#### 2. Screens
- **Region look map:** country map, zones filled, core solid, edge faded. Under it, 8 thumbnails of the tapped zone, all different roads, 2 edge spots dashed. Zone name only. Key 2 adds the neighbor's strip for side-by-side. Fresh 8 each visit, then marked seen.
- **Feature map:** the cached Plonk It image as is, one line of 12 words (labels/visual.json `lookFor`), and 2 fresh panoramas showing it. Ranked by `acow/clue-value.json`.
- **Border walk:** zone A core, 4 spots between, zone B core.
- **Drill:** GeoGuessr's own panorama, NoMove, 12 s (pack `gameSettings`). A hit under 10 s gets a one-second chip and no card.
- **Miss card (three things):** the big missed photo, a mini zone map (truth green, pin red), and one strip of 3 other spots from the true zone. Key C swaps the strip to the pinned zone. No sentences.

```svg
<svg viewBox="0 0 420 190" width="400" fill="none" stroke="currentColor" font-size="11">
<path d="M20 30 L110 15 L150 55 L130 120 L60 140 L15 90Z" fill="var(--c1)" fill-opacity=".8" stroke="var(--border)"/>
<path d="M150 55 L230 40 L250 100 L190 130 L130 120Z" fill="var(--c2)" fill-opacity=".8" stroke="var(--border)"/>
<path d="M130 50 L170 48 L165 125 L128 118Z" fill="var(--c1)" fill-opacity=".35" stroke="none"/>
<circle cx="205" cy="70" r="5" fill="var(--error)" stroke="none"/>
<rect x="10" y="150" width="46" height="34"/><rect x="62" y="150" width="46" height="34"/><rect x="114" y="150" width="46" height="34" stroke-dasharray="3"/>
<rect x="166" y="150" width="46" height="34"/><rect x="218" y="150" width="46" height="34" stroke-dasharray="3"/><rect x="270" y="150" width="46" height="34"/>
</svg>
```

#### 3. Location supply
- `gap/pools/<CC>-locations.json` via `gapfill.vali_pool(cc, goal)` holds panoId, lat, lng, heading and subdivision. Top-30 pools hold 298 to 2,254 spots (US 2,254, AU 767).
- Weights are in `acow/weights.json`. `acow.py sample` already writes 1,270 ACoW-shaped rounds. Images come from `collect.thumb(view, fov)`, four headings as in `gapfill.finish`.
- Volume is about 1,800 rounds in 12 days. The US needs about 165. The smallest top-30 pool (RO, 301) needs about 20. Exams hold out 3 x 60 spots. `seenLocationRefs` in `makeNextSet` already enforces unseen-only.
- Gap: Vali pools are not ACoW's rural mix (acow.py docstring). Run `rurality.py` over the top-30 pools overnight (model cost) and drop non-rural spots.

#### 4. Deep focus
`leak(c) = share(c) x (sum loss + 8 x 1846) / (n + 8)`. Loss is 5000 minus score. n is duel rounds plus 0.5 per fresh drill round. Today: US 163, BR 136, RU 110, AU 97, CA 94, IN 94 points per future round. This is ACoW-only, unlike the brief's all-maps table. Inside the focus country, the (true zone, pinned zone) pair with the largest shrunk loss is the focus, and the loop alternates its two zones. It changes every 3 days. It changes early if loss per fresh round falls under 5% over the last 40 focus rounds (the US plateau guard). The next focus is the best leak excluding the last. A zone leaves the loop after 3 consecutive fresh hits under 10 s (PALM rule).

#### 5. Measurement
- **Exams:** 60 held-out spots on Nov 3, 8 and 12, cold, same country mix. The metric is points lost per round with an error bar. His SD is 1,464, so 60 rounds gives plus or minus 189, and only gains above about 400 prove anything.
- **Same-day proof:** blocks B and C score blind rounds before study and fresh rounds after, same zones, different spots. Display, for example: "blind 38% to after 61% zone hits" (illustrative).
- **Trend:** blocks A and D give 120 fresh rounds a day, so a 3-day window is plus or minus 77. Fresh spots avoid the 84% repeat versus 50% new inflation.

#### 6. Build plan (about 20 h, estimates and all thresholds are my inference)
1. Day-1 exporter (1 h): ACoW-weighted unseen spots from `acow/sample.json` as 150-coordinate sets for a second Fieldwork map, 12 s NoMove. Native GeoGuessr result screen.
2. `lookzones.py` (2 h): Köppen grid per country, edge flag.
3. `looksheet.py` (3 h): study, overview and border pages as static HTML via `scripts/serve.mjs`. The tour works from here.
4. `planMix` in `next-set.mjs` plus `lookpack.py` (3 h): 5 countries per set, 3 trials before a zone recurs, exam split.
5. `lookCard` in `ui.mjs` and `zoneAt` in `geo.mjs` (3.5 h). Attempts store guess, km and ms.
6. `leak.py` plus Today screen (3 h), then the exam and same-day uplift dashboard (3 h).
7. Rural filter and feature-map pages (3 h).

---

## 10. Design: Sol A (data, location supply, measurement)

#### 1. Daily 2h+ session

**Train the whole world every day, plus one deep focus.** Nov 3 through Nov 14 inclusive. All schedules, thresholds and effort estimates below are **[INFERENCE]**.

| Minutes | Activity |
|---|---|
| 0 to 15 | Unseen assessment: 20 world spots, 10 focus spots. Fixed 20-second limit. No teaching until the block ends. |
| 15 to 18 | Break |
| 18 to 30 | Study: one feature map, then one region look map. Review assessment misses through these maps. |
| 30 to 45 | Mixed-world practice |
| 45 to 48 | Break |
| 48 to 63 | Deep-focus practice, interleaving its confusable regions |
| 63 to 66 | Break |
| 66 to 81 | Mixed-world practice |
| 81 to 84 | Break |
| 84 to 99 | Deep-focus practice on different spots |
| 99 to 102 | Break |
| 102 to 117 | Ranked duels |
| 117 to 120 | Break |
| 120 to 135 | Ranked duels. Finish any live duel. |
| 135 to 140 | Refresh duels, view results, stop |

That is **122 active minutes**. Practice rounds allow roughly 15 seconds to read the scene, then pin and immediate feedback. No moving.

Days 1 to 3 establish baseline. Days 4 to 10 retain this routine. Days 11 and 12 replace the second focus block with mixed-world practice, retaining the first focus block. Short blocks follow Seth’s reported fatigue and [research-adhd.md](local://research-adhd.md).

#### 2. Screens

**Study screen**

- Two tabs: **Feature / Region looks**.
- Feature: country outline, one feature family, real object crops positioned over applicable areas. Example: supported versus unsupported Brazilian poles. One short legend.
- Region looks: country outline with selectable regions. Selected region connects to three fresh landscape thumbnails from geographically separated roads.
- Region names, attribution, next button. No species lists or prose paragraphs.
- Rotate panorama examples on every presentation. Schematics can recur.

**Drill screen**

- Panorama, compass, timer, pin map, submit.
- No upcoming country, region or clue label.
- After submission: true pin, guessed pin, distance, one visual explanation, next.

**Miss card**

- Actual missed scene with one outlined clue.
- Small map shading the answer region and marking his pin.
- One fresh thumbnail from the region he guessed.
- Two place labels, at most eight explanatory words, next.
- No self-rating required for geographic accuracy.

Fresh exemplars, retrieval and visual comparison are supported by [research-perceptual.md](local://research-perceptual.md). Applying them to GeoGuessr remains an inference.

#### 3. Location supply

**Use the existing pools, not the two-or-three-example teaching decks.**

Inspected `$WORLD_PACK_DATA/gap/pools/*-locations.json`: **50,927 distinct panorama IDs across 127 pools**, including US 2,254, Russia 1,266, Brazil 1,071 and Australia 767. These are candidates, not verified unseen inventory.

Reuse:

- `gapfill.vali_pool()` and `gapfill.split()` for real panoramas and subdivision tags.
- `acow.weights()` and `acow.urban_shares()` for country and urban quotas.
- `collect.thumb()` for availability checks.
- `rurality.label()` for setting.
- `session.publishPracticeSet()` and `startPracticeGame()` for existing five-location delivery.

Build one global exposure ledger, shared across packs, study thumbnails, drills and assessments. Seed it from imported learner history and `duels/rounds.json`. Burn a panorama when displayed, including abandoned rounds. Exclude alternate captures near previously displayed coordinates. Reserve assessment locations separately before generating study material.

Draw world practice by ACoW country weights and rural quotas. Draw focus practice by subdivision tags. Refill before fewer than three sessions remain.

**Important existing limitation:** `vali_pool(cc, goal)` returns its existing cache without enlarging it. Add explicit append-only regeneration with larger goals, deduplication and availability checks. Never recycle exhausted locations.

Existing Vali pools approximate ACoW. They do not reproduce its exact regional distribution, as documented in `tools/world-pack/README.md`. Feature claims require accepted source evidence, not merely a matching subdivision.

#### 4. Deep focus

From `duels/rounds.json`, use the last 14 days of **NoMoveDuels on A Competitive World**, including wins.

For each round, define score shortfall:

`d = max(0, theirScore − myScore)`

For country `c`:

`priority(c) = ACoW_share(c) × (sum(d_c) + 5 × global_mean_d) / (round_count_c + 5)`

This estimates shortfall per world round and limits tiny-sample spikes. It is not multiplier-adjusted HP damage.

**Actual initial choice: US**, approximately 44 expected points per world round, versus Brazil 40 and Canada 31. The filtered window contains 833 rounds. US shortfall is mostly correct-country regionguessing: 29,732 versus 10,861 wrong-country points.

Teach US regional looks first. Select contrasts from `subdivision → myGuessSubdivision`, not arbitrary vegetation topics.

Recalculate nightly. Hold focus three days minimum. Switch when another country leads by 20% on two consecutive refreshes.

#### 5. Measurement

Freeze assessment country, regional and rural proportions. Use fresh, withheld spots under identical timing.

Show only:

- Country accuracy.
- Median kilometres.
- Fixed-world-scale point error, calculated from pin distance rather than potentially changing practice-map bounds.
- Sample count and uncertainty interval.

Compare days 1 to 3 against days 4 to 6, then days 7 to 9. Show earlier trends as **provisional**, not proof. Separate focus and world results. Never count “Spotted,” repeated panoramas or assumed feedback as improvement.

Ranked rating is the outcome check, not a clean learning measure. Champion by Nov 14 is the target, not a guarantee.

#### 6. Build plan

| Order | Deliverable | Effort |
|---|---|---|
| 1 | Pool importer, global exposure ledger, reserved assessment split, five-round publishing | 3 to 5 hours |
| 2 | Timed probes, coordinate grading, baseline report | 2 to 3 hours |
| 3 | Minimal miss card and source-backed feature/region study screens using cached guides, `refs/`, `lm/exports.jsonl`, Natural Earth geometry | 4 to 6 hours |
| 4 | Nightly focus calculation and explicit pool replenishment | 2 to 4 hours |

Day 1 uses existing delivery and cached visuals. Keep FSRS-6 for discrete clues. Do not rebuild the scheduler ([research-fsrs.md](local://research-fsrs.md)). No repository edits or runtime verification performed.

---

## 11. Design: Sol B (12-day deadline)

#### 1. Daily 2h+ session

**Spend these 12 days reducing expensive errors, then converting that improvement into rating.** Big-country regionguessing has high competitive value ([research-geoguessr.md](local://research-geoguessr.md)). Champion by Nov 14 is plausible from his current position, not guaranteed.

**Default: 140 minutes, including 123 active minutes.**

| Minutes | Activity |
|---|---|
| 0-15 | Unseen, whole-world benchmark. No hints. Feedback after the block. |
| 15-18 | Break |
| 18-30 | Study today’s focus: feature map, then region look map |
| 30-45 | Focus drill, interleaving its confusable regions |
| 45-48 | Break |
| 48-63 | Whole-world mixed drill, immediate feedback |
| 63-66 | Break |
| 66-81 | Focus drill on different roads and panoramas |
| 81-86 | Break |
| 86-101 | Whole-world mixed drill, including yesterday’s costly categories |
| 101-104 | Break |
| 104-134 | Ranked no-move duels. Finish the current game. |
| 134-140 | Import results. Inspect the two costliest misses. |

All world blocks retain the full ACoW country distribution. Focus is additional, never a replacement. Short blocks address Seth’s observed attention decline ([research-adhd.md](local://research-adhd.md)).

| Day | Date | Specific change |
|---|---|---|
| 1 | Nov 3 | Establish baseline. Start Brazil, subject to refreshed data. |
| 2 | Nov 4 | Retrieve yesterday’s distinctions on new examples before studying. |
| 3 | Nov 5 | First delayed-transfer comparison. Keep or simplify weak distinctions. |
| 4 | Nov 6 | Recompute focus. Study the winning area’s two costliest confusions. |
| 5 | Nov 7 | Vary roads, seasons and cameras within those regions. |
| 6 | Nov 8 | Test weak regions without obvious infrastructure clues. |
| 7 | Nov 9 | Recompute focus. Compare first three days with latest three. |
| 8 | Nov 10 | Revisit previous focus categories only within mixed practice. |
| 9 | Nov 11 | Emphasize 10-second decisions, followed by normal pinning. |
| 10 | Nov 12 | Final focus selection. No new niche topics. |
| 11 | Nov 13 | Rehearse ranked pressure. Consolidate recurring costly errors. |
| 12 | Nov 14 | Replace second focus and final mixed block with ranked play: 60 minutes total. Keep benchmark, mixed practice and first focus. |

Timing and progression are **[INFERENCE]**, not a validated GeoGuessr protocol.

#### 2. Screens

**Study screen**

- Two tabs: **Feature** / **Region look**.
- Feature: country outline, one feature family, actual object crops placed geographically. Example: Brazil pole supports. One short qualifier, source link.
- Region look: country map with four broad regions linked to three fresh panorama thumbnails each. Region names only. Selecting one enlarges its strip.
- Study panoramas become ineligible for future tests.

**Drill screen**

- Panorama, compass, pin map, timer, block progress.
- No country, category or clue labels before guessing.
- First-look decision at 10 seconds. Pin by 30 seconds. Rotation and zoom allowed, movement forbidden.
- Immediate answer map and distance after submission.

**Miss card**

`YOUR GUESS [one fresh comparison photo] | ANSWER [round photo]`

Below: one map showing both regions, one highlighted visual difference, caption of at most eight words. **Next** and optional **Source**. No species lists, cue grids or compulsory typing.

Fresh examples, comparison and retrieval follow [research-perceptual.md](local://research-perceptual.md). Their transfer to GeoGuessr remains **[INFERENCE]**.

#### 3. Location supply

Use `$WORLD_PACK_DATA/gap/pools/*-locations.json`: **50,927 cached locations across 127 pool files**, counted directly. Brazil has 1,071, Russia 1,266, US 2,254, Australia 767.

Reuse:

- `acow.py:weights()` for country shares.
- `gapfill.py:split()` for subdivision tags.
- `gapfill.py:sample()` for region filtering.
- `collect.thumb()` and `rurality.jsonl` for previews and rural selection.
- `session.mjs:publishPracticeSet()` / `startPracticeGame()` for existing five-location games.

Add a persistent exposure ledger covering study, drills and imported duels. Exclude matching pano IDs and nearby captures within 1 km. Reserve unseen benchmark locations before study selection.

**Existing Sprint is insufficient:** `src/sprint.mjs:planSet()` eventually reuses least-recently-used locations. `acow.py:sample()` is deterministic. `vali_pool(cc, goal)` does not enlarge an existing cache.

Generate separate Vali batches when unused regional stock falls below two sessions. Merge and deduplicate. Never silently recycle. Country weights plus rural filtering produce **ACoW-like**, not actual ACoW subdivision distribution.

#### 4. Deep focus

For the latest 300 eligible ACoW no-move duel rounds:

\[
P(c)=p_{\mathrm{ACoW}}(c)
\frac{\sum_{i\in c}\max(0,\mathrm{theirScore}_i-\mathrm{myScore}_i)+10\bar L}{n_c+10}
\]

Here, \(\bar L\) is mean loss across those rounds. Count wins and losses in \(n_c\).

This selects **Brazil: 56.9 expected points lost per world round**, ahead of US 37.7 and Canada 36.0 in the inspected cache. Historical Russia totals alone would select the wrong starting focus.

Within Brazil, begin with Santa Catarina and Alagoas confusions. Their samples are small, so use broad contrasts, not province memorization.

Recompute daily. Change only on days 4, 7 and 10 when another area leads by 20%. These thresholds are **[INFERENCE]**.

#### 5. Measurement

Show only:

- Unseen benchmark points lost: baseline versus latest three days.
- Country accuracy and catastrophic-miss rate.
- Focus median distance and sample count.
- Ranked rating and remaining gap.

Keep benchmark weights and timer fixed. Never report repeated-photo recognition or “Spotted” ratings as improvement. Show uncertainty with small samples. By day 3, look for improvement without slower answers, not a promised percentage.

#### 6. Build plan

**Effort estimates [INFERENCE]:**

1. **Today, 60-90 minutes:** fresh-pool selector, exposure ledger, benchmark split. Reuse publication.
2. **Next 60-90 minutes:** compact miss card, one cached Brazil feature map, linked fresh region strips. Day 1 becomes usable.
3. **Next 1-2 hours:** score logging, focus calculation, baseline comparison.
4. **Next 2-4 hours:** separate-batch replenishment and automatic strip rotation.

Keep FSRS-6. Scheduler upgrades have less immediate value than unseen-location transfer ([research-fsrs.md](local://research-fsrs.md)). No new atlas, neural scheduler or catalogue rebuild.

Read-only investigation completed. No code changed or checks run.

---

## 12. Design: Sol C (buildability in Fieldwork)

#### 1. Daily 2h+ session

**Nov 3 to Nov 14: whole world every day, plus one data-picked focus.** Proposed schedule totals 140 minutes, including 15 minutes of breaks. Timing and thresholds below are design inferences, not validated GeoGuessr prescriptions.

| Minutes | Activity |
|---|---|
| 0-10 | Cold test: fresh world and focus spots, no hints. Hold explanations until the set ends. |
| 10-20 | Study today’s feature map and region-look map. One feature, then compare two confusable regions. |
| 20-35 | Mixed-world no-move rounds, immediate visual feedback. |
| 35-40 | Off-screen break. |
| 40-55 | Deep focus, interleaving its regions rather than repeating one region. |
| 55-70 | Mixed world. |
| 70-75 | Break. |
| 75-90 | Deep focus, new roads, cameras and seasons. |
| 90-105 | Mixed world. Include yesterday’s mistakes on different spots. |
| 105-110 | Break. |
| 110-130 | Ranked duels. Finish an ongoing duel rather than chase another. |
| 130-140 | Fresh transfer checks, refresh duel data, inspect today’s result. |

**Days 1-2:** establish baseline, use 30-second training rounds.  
**Days 3-9:** 20-second training rounds. Keep test timing fixed.  
**Days 10-12:** replace the second focus block with timed duel-pressure practice, still targeting that focus. No new feature collection on Nov 14.

Short blocks address Seth’s observed fatigue. Research supports retrieval, varied examples and interleaving, but does not establish these exact timings: [perceptual](local://research-perceptual.md), [ADHD](local://research-adhd.md).

#### 2. Screens

| Screen | Only these elements |
|---|---|
| **Study: feature map** | Country outline, one feature family, photographed variants placed over their supported ranges, maximum six-word labels. Source link. Toggle: “Region looks.” |
| **Study: region looks** | Same country map. Select a region to highlight it and reveal three fresh panorama strips from separate roads. Region name, nothing descriptive. Neighbour selection replaces the strip for comparison. |
| **Drill** | Native GeoGuessr panorama, native pin map, timer, round number. No target, country, feature or focus label before guessing. |
| **Miss card** | Missed panorama with one marked cue, true region shaded on inset map, one fresh example from the guessed region. Two region names, one short contrast label, Next. Source under More. |

Use the existing `ui.mjs` dialog and `atlas.mjs` country navigation. Add **`src/study.mjs`** for both study views. Use cached complete feature-map images first, not an automatic diagram generator.

Simplify `vegcard.mjs`’s default miss view. Reuse `headline()`, `regionThumbs()` and image loading. Remove species lists, recurrence galleries and extra cue tiles from the default surface. Its `regionMap()` is US-specific, not a worldwide renderer.

#### 3. Location supply

**Do not replay the existing Sprint deck as the main practice supply.** `sprint.mjs` eventually recycles panoramas, and `acow.sample()` uses a deterministic sample.

Add **`tools/world-pack/training.py`**, producing a private training pack:

- Read `$WORLD_PACK_DATA/acow/weights.json` for world proportions.
- Read `gap/pools/<ISO2>-locations.json`. Reuse `gapfill.split()` and subdivision tags for focus regions.
- Reuse `gapfill.finish()`/`collect.thumb()` for images, `rurality.label()` for setting checks, and `globe_data.geometry()` for country/admin1 outlines.
- Approximate ACoW’s rural weighting. Label the result **ACoW-shaped**, never actual ACoW coverage.
- Use `sources/mapped.json`, `clues.json`, `lm/matches.json` and cached source images for supported feature claims. Geography alone never proves a pole or soil feature exists.
- Maintain one global exposure ledger keyed by `panoId`, including study strips, cards, drills and imported duel locations. Exclude nearby alternatives within 1 km [inference].
- Reserve disjoint test roads. Never teach them first.

**Critical fix:** `gapfill.vali_pool()` only generates when its cache is absent. Increasing its goal does not refill it. Add append-and-deduplicate generation, triggered below two sessions’ supply. Exhaustion pauses that region. Never silently repeat.

#### 4. Deep focus

Use recent ACoW duel rounds from `duels/rounds.json`:

`priority(c) = ACoW_share(c) × (sum positive score deficits(c) + 10 × global mean deficit) / (rounds(c) + 10)`

Count wins and zero-deficit rounds in the denominator. Reuse `sprint_stakes.py`’s deficit fields, not its raw totals or recent-card boost.

Choose one country, then its largest regional confusion. Recalculate nightly. Switch only after two sessions and when another candidate leads by 25% [inference]. Russia’s 36k total suggests a candidate, not a proven winner.

#### 5. Measurement

Show **fresh-world country accuracy**, **median regional error in km**, and **catastrophic misses**, with sample counts and baseline comparisons.

Compare days 1-2 against days 4-6, then days 10-12, using identical timing and country weights. Test feedback appears after each five-round set. Exclude study-exposed spots.

Keep duel score deficit separate from drill geography. Never call “Spotted” or Sprint retirement transfer. Keep FSRS-6 for discrete features, not panorama mastery: [FSRS](local://research-fsrs.md). Champion remains the goal, not a guaranteed outcome.

#### 6. Build plan

Effort estimates are inferences.

| Order | Exact work | Effort |
|---|---|---|
| 1 | `training.py`: cached-pool pack, focus formula, held-out partition. | 1-2h |
| 2 | `sprint.mjs`: training-pack selection with strict freshness. `next-set.mjs` passes options. `browser.mjs` reserves global pano exposures. Reuse five-location publication and `startPracticeGame()`. | 2h |
| 3 | `study.mjs`, `atlas.mjs`, `ui.mjs`: cached feature maps, fresh region strips, minimal miss view. Day 1 usable. | 1-2h |
| 4 | `session.mjs`: save guess coordinates and elapsed time. New `training.mjs`: metrics and daily block selection. Surface through `drill.mjs`. | 2-3h |
| 5 | Refill generation, extend `refresh.sh`’s data stage, document private pack setup in `docs/CONTENT.md`. Add freshness, partition and grading checks. | 3-5h |

No new app, scheduler upgrade or public personal-data pack. Read-only inspection completed. No checks executed. Implementer should run `npm run check` and existing publication fixtures.

## Build log

### 2026-11-03, BuilderData, pilot gate

- Implemented the private pack builder, explicit macro-region memberships and
  dissolved Natural Earth geometry cache, exact-view two-model labels, stable
  10/60/30 splits, focus calculation, exclusion ledger and opt-in Vali refill.
- The 40-spot pilot contains 15 US pool spots, 10 US duel-loss spots, and three
  pool spots each from Brazil, India, Australia, Russia and Indonesia.
- Pilot QA: `/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work/world-map/training/qa-pilot.html`.
  BuilderData inspected all 40 images with their boxes and claims, then checked
  the cited source texts. Found 0/40 spots with a clearly wrong retained claim.
  This is an agent visual inspection, not a measured human accuracy estimate.
  There are 77 retained claims: 14 Plonk It, 5 Learnable Meta and 58 explicitly
  unsourced observations. Observations do not claim regional exclusivity.
- Screenshots: private `training/qa-pilot-1.png` through `qa-pilot-9.png`.
  The first image covers eight spots and each remaining image covers four.
- Paused the prematurely started full run when the pilot instruction arrived.
  Completed labels remain cached. The pilot passes the requested 10% error gate,
  so the bounded full run can resume with two workers.
- First pack: 23,599 locations, 2,423 probe, 14,056 drill, 7,120 study, 90
  countries and 99 active regions. Focus: United States of America, score
  44.2441, n=85, then Brazil 40.3814, n=70 and Canada 30.4945, n=31.
  Top-40 pool coverage will grow as verified rural labels arrive.
- Bound the local Training entry to the newly created dedicated map
  `6ae996c3e2700bdd18e5d352`. Pack game settings are No Move, 60 seconds.
  No map publication or account gameplay was performed by BuilderData.
- Checks passed: `python3 tools/world-pack/training.py test`, and
  `npm run check` (227 passed, one skipped, zero failures, typecheck passed).

### 2026-11-03, BuilderUI, engine and screens

- `scheduler: 'deal'` (src/deal.mjs). The scheduler is a ranked feed rebuilt from attempts after every guess.
  - Region and meta mastery are Beta(1 + misses, 1 + hits). Each outcome is weighted by recency: the weight halves
    every 3 days and counts double in the current session. A right answer slower than 20 s counts 0.7 hit, 0.3 miss.
  - Each fresh spot scores ACoW share × a Thompson draw of its region's miss probability × (1 + 1.5 per due meta it
    shows) × (1 + confusion weight) × novelty 1.3 (region or meta not met in 7 days) × fade 0.25 (3 fast right answers
    in a row).
  - Constraints, in order: the latest confusion becomes a contrast pair (the true region and the region pinned
    instead); then at least 2 due-meta spots (due regions when metas are unlabelled), at least 1 focus spot and at least
    2 world spots. At most 2 spots per country and 1 per region, except a pair.
  - Retests: a fresh spot in the next set, then the next day, then 3 days after the miss. Duel losses (`duelLosses`)
    count as misses.
  - Never repeats a panorama from attempts or exposures. Study spots are never published.
- Grading by the pinned macro-region (`regionFeatures`) with world-scale points (5000·e^(−10·d/14916.862)) and the
  guess time. A pin within 25 km of the answer counts as the right region, so coasts and simplified borders are not
  penalised.
- Screens (src/training-ui.mjs, training-start.mjs, region-map.mjs) follow the proto-v2 style.
  - A card after every round: result, where you guessed (wrong pins only), what the answer region looks like, plus a
    tell when one exists. Space and ← move between beats; × or Esc closes.
  - Magnifier markers sit on meta boxes. Hover or Tab opens the meta's name, image, mini map and source. With manual
    keys on (a setting on the start panel), U marks the meta used and N marks it not noticed.
  - After round 5: a recap. Every 15 minutes: a session check with one recommendation.
  - Start panel: tiles with n, due counts, the focus map shaded by miss probability, Play, Look board (L). D opens a
    debug view that lists the ranked candidates and their score terms.
  - The next set is published while the round-5 card is up, so Next set only launches it.
- Verification: 17 deal tests in `npm run check`. `fixtures/training-shots.mjs` renders every screen from the sample
  pack and the real pack. `fixtures/training-e2e.mjs` runs the built userscript with the real pack through a stubbed
  GeoGuessr: start, Play (No Move, 60 s), 5 cards, recap, next set published ahead, game 2, 10 distinct panoramas,
  0 study spots played.

### 2026-11-03, BuilderData, diagnostic re-pilot and seen material

- The first pilot was visually accurate but failed the usefulness bar: its
  magnifiers were mostly generic observations. It is not approval for scaling
  that objective. Version-1 magnifiers are now excluded from every pack.
- Re-ran the same 40 photos with a diagnostic-only objective. The labeler and
  verifier must justify `narrowsTo` and `vs`, reject generic magnifiers, use
  tight object boxes covering at most 20% of the frame, and allow honest none.
  Added geographically scoped LM regional notes and capped candidate context
  at 80 distinct tips, with regional sources first.
- The revised pilot retained four diagnostic magnifiers on four spots, with
  36 honest empty spots. BuilderData inspected all four new magnifiers against
  the photos and sources. Found zero generic magnifiers and zero clearly wrong
  retained claims. The two California pole-band details are small at 640x400,
  so independent model agreement is not presented as measured human accuracy.
- Current pilot sheet: private `training/qa-pilot.html`. Screenshot of all four
  retained magnifiers: `training/qa-diagnostic-magnifiers.png`.
- Imported unique duel and Sprint panoramas as `split:'seen'`, always card-only,
  never assessment or game material. Region assignment uses the answer geometry
  and admin1 fallback. Country-only unresolved assignments are marked explicitly.
  Every playable region now has at least four study+seen spots except Belarus,
  which has zero. Its entire cached pool has two panoramas, both game-hash,
  and no duel/Sprint history. No repeated or invented photo fills that hole.
- Preserved every source island and reduced geometric simplification tolerance.
  Fresh game candidates outside their own answer polygon are excluded rather
  than being misgraded. No overlap-causing border buffer was added.
- Pack revision 4: 28,214 locations, including 12,896 drill, 2,235 probe,
  7,127 study and 5,956 seen. Known urban seen spots were filtered (42 removed).
  Panorama IDs are canonical 22-character Google IDs, decoding 44-character hex
  aliases first. Long user-photosphere IDs are not training material.
- Pipeline commit `18cfc72` pushed on `training-system`. Before that commit,
  the data self-check and `npm run check` passed: 244 passed, one skipped,
  zero failures, typecheck passed.

### 2026-11-03 11:10 UTC, BuilderData, ingestion and supply checkpoint

- Unknown rurality is now honestly playable (`rural:null`), below verified rural
  in scheduler preference. Known urban, suburban and indoor photos are omitted
  from all splits, including card-only seen material. Split hashes never change.
- Cached network-only thumbnail sweep completed 45,350 views: 44,881 available,
  469 invalid/black, zero network errors. Main's separately reported black view
  was accepted as ground truth, cached false and not re-fetched to confirm it.
  Exact-view checks and concurrent thumbnail cache writes are atomic.
- Cheap Luna rurality pass used two workers and stopped at 6,606 attempted views
  as its planned shortages exhausted, under the 8,000 cap. This is separate from
  diagnostic labeling, which remains two independently checked models.
- Revision 176 contains 45,588 locations: 28,257 drill, 4,702 probe, 7,282 study,
  5,347 seen. Top-40 playable region min/median is 0/152. Only current supply
  shortages are Indonesia Papua (0) and Canada Pacific (79 of 80). Refill is still
  running. Papua lacks Vali subdivision files locally and in the upstream
  country inventory, so no photosphere or neighbouring region is substituted.
- There are 141 verified-meta locations and 81 precise admin1-union footprints.
  Two precise source scopes lack geometry and stay null rather than shading
  misleading macro-regions. BuilderUI added the corresponding country-outline
  guard in `2428f4d`. Rebuild the local userscript to pick up that UI change.
- New random 60-photo QA: `training/qa.html`, `training/qa-sample.json`, screenshots
  `training/qa-random-1.png` through `qa-random-8.png`. Inspected all 60 photos,
  all five retained magnifiers and their cited LM source text. Five diagnostic
  claims, 55 honest empty lists, zero clearly false or generic retained claims.
  Three landscape cues are regional source matches, not exclusive identifiers.
  Rural/suburban/indoor classifications looked consistent. This is a small
  visual inspection, not a measured human accuracy or recall estimate.
- Portable no-private-data and private-pack self-checks passed. `npm run check`
  passed 266 tests, one skipped, zero failures, including TypeScript checks.
  An over-strict new registry assertion initially rejected contract-supported
  `observed` annotations with null IDs. Corrected the assertion, not the data.
- Adaptive board seeding remains capped at 5,000 study candidates and 1,600
  model calls for this run. Country ordering uses ACoW weight times focus, US
  first. Regions stop scheduling at four unique rural meta-bearing photos,
  allowing at most six after an in-flight batch. Final regional counts follow
  when that pass completes.
