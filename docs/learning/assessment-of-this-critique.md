# Assessment of this critique

## Verdict

The critique is directionally sound. Its strongest point is the need for a single usable takeaway after a miss. It overstates the choice between species and contrasts, and the proposed routine needs more fresh-scene practice and less repeated cold failure.

| Claim | Grade | Evidence and boundary |
| --- | --- | --- |
| 1. The miss reveal is too dense and has no single takeaway. | **Supported** | **Local observation:** accept Seth's report of about 15 items. The code can show a full boxed scene, map, two regional galleries, tree chips, and up to four cue tiles. **Moderate:** task-focused, explanatory feedback has support from [Shute](https://doi.org/10.3102/0034654307313795) and [van der Kleij and colleagues](https://doi.org/10.3102/0034654314564881). **Inference:** reducing this reveal to one takeaway should help. No study establishes that 15 items is a failure threshold or that exactly two cues is optimal. |
| 2. The drill teaches species when it should teach one or two tells per confused pair. | **Partly** | **Strong:** visual-category interleaving benefits depend on similarity, as shown by [Brunmair and Richter](https://pubmed.ncbi.nlm.nih.gov/31556629/). **Moderate:** explicit contrast helped new-painting classification in [Kang and Pashler](https://doi.org/10.1002/acp.1801). **Local observation:** this card already teaches scene cues and compares truth with the guessed region. Species knowledge can contribute, but a species shared by both places does not distinguish them. **Inference:** make the comparison explicit, rather than replace all species information or build a pair card for every error. |
| 3. Feedback is mostly negative, with 8% spotted in 24 rounds and no framework. | **Partly** | **Local observation:** accept the reported rate and frustration. **Moderate:** support for competence matters to motivation, according to [Ryan and Deci](https://pubmed.ncbi.nlm.nih.gov/11392867/). **Moderate:** failed attempts can still support learning with corrective information, as in [Kornell and colleagues](https://pubmed.ncbi.nlm.nih.gov/19586265/). **Inference:** repeated no-basis misses warrant scaffolding. The rate alone does not prove absence of a framework, harmful feedback, or zero learning. |
| Routine: 10 to 15 minutes cold, then 10 minutes studying the three most-missed regions and writing one rule each. | **Partly** | **Moderate:** pretesting followed by learning has support from [Pan and Carpenter](https://doi.org/10.1007/s10648-023-09814-5). **Moderate:** novel-bird classification benefited from a balance of study and testing in [Jacoby and colleagues](https://pubmed.ncbi.nlm.nih.gov/20804279/). **Inference:** the fixed times, exactly three regions, and rule-writing alone are not validated. Add fresh unaided classification and delayed review. A tiny cold sample cannot stably rank regions. |

Supported means the core recommendation has a defensible evidence basis, not that a causal experiment has confirmed this particular interface problem.

## What is already true of this drill

**Local observation.** [vegcard.mjs](../../src/vegcard.mjs) already places the guessed and actual regions side by side after an in-pack wrong pin. Each can show two panorama thumbnails and three tree chips. The current scene has numbered boxes, a geographic summary, and up to four cue tiles. Species maps are secondary evidence, and the code distinguishes a species named in the panorama from one merely common in the region. The change is to prioritize and connect existing material, not add another feedback dashboard.

**Local observation.** [ARCHITECTURE.md](../ARCHITECTURE.md) describes automatic region grading and explicit overrides. The local pack uses the sprint scheduler and recognition grading policy. Pin correctness, reported spotting, and identifying a cue before the reveal are different outcomes. Do not relabel the reported 8% as a measured unaided cue-localization rate.

**Local observation from prior analysis.** `.scratch/eval-sol-learning.md` found only one repeated named US true-to-guessed region pair, Central Appalachians to Northeastern Highlands, with two occurrences. Most named errors were singletons. Its 74-round analysis used a different task and denominator from the reported 24 drill rounds. Use it to seed broad families, not infer a reliable top-three confusion ranking. `win/LearnSeth.md` separately found much better repeated-picture performance than performance on new panoramas, with post-reveal grading limitations.

## Ranked changes for this card and practice loop

Every ranking, threshold, duration, and sample size below is **Inference**. Expected impact is a reasoned priority, not a measured effect size or rating-gain forecast.

### 1. Make a miss teach one contrast

**Expected impact: highest.** Keep the current pin-first trial. On a miss, show the actual region and guessed region neutrally. Make one sentence the headline: visible evidence, why it favors the actual region, and why it weakens the guessed alternative. Highlight **one or two visible cues in total** on the full current scene. Keep one useful rival scene at readable, comparable scale. Put extra galleries, all-tree lists, and species ranges behind optional detail. Keep them available when they explain the distinction.

A miss with no reliable separator should say that this view is ambiguous. Do not invent a botanical identity or unique regional tell. A pin outside pack coverage needs an explicit coverage note, not a fabricated comparison.

**Evidence basis:** short elaboration retains information that bare correctness lacks, while reducing unrelated active demands. See [feedback](feedback.md), especially [Kluger and DeNisi](https://doi.org/10.1037/0033-2909.119.2.254) and [Shute](https://doi.org/10.3102/0034654307313795).

**Measurable check:** compare current and focused reveals across matched scene families, with equal total practice time and counterbalanced order. On twenty held-out, unboxed locations per condition the next day, measure correct pre-reveal cue identification, pin distance, and false-positive cue claims. Keep the compact version if fresh-scene decisions improve, not merely if reading gets faster. Twenty is a pilot budget, not a power calculation.

### 2. Turn each useful contrast into new-location practice

**Expected impact: high.** Write the rule for the actual confusion, using at most two cue dimensions. Then practice different locations of both regions and return to single-scene pinning. Reuse family-level distinctions instead of creating a permanent card for every historical singleton. Expand the example bank if the same few scenes are exhausted.

These examples come from the current pack and remain conditional hypotheses, not validated region classifiers:

- **Piedmont versus Middle Atlantic Coastal Plain:** both have pines. Rolling terrain plus exposed red clay favors Piedmont. Flat terrain plus wet drainage favors Middle Atlantic Coastal Plain. Use only what is visible.
- **High Plains versus Northern Glaciated Plains:** dry shortgrass on a smooth plain versus undulating land with seasonal wetland depressions. Landform and moisture are the dimensions. A green crop or a missing pond in one frame is not decisive.
- **Central Appalachians versus Northeastern Highlands:** do not use dark conifers or a forest-walled road alone as a separator. If no defensible scene relationship is visible, teach the shared forested-hill family and label the fine distinction unresolved by this view.

The [contrast note](contrast-and-categories.md) explains the rule format and caveats. A useful rule can include an uncertainty condition. It need not force a decision from vegetation alone.

**Evidence basis:** [Kang and Pashler](https://doi.org/10.1002/acp.1801) tested discriminative contrast, while [Carvalho and Goldstone](https://pubmed.ncbi.nlm.nih.gov/24092426/) show why category structure matters. [Kellman and Krasne](https://doi.org/10.1080/0142159X.2018.1484897) support active, varied perceptual learning, not rule recitation alone.

**Measurable check:** at baseline and about a week later, test different roads from both sides of each target contrast. Report A-to-B and B-to-A confusions separately with counts, median pin distance, and cue false positives. Include an atypical and a cue-absent scene. Better paired-choice accuracy with unchanged single-scene pinning is not sufficient.

### 3. Manage success by changing support, not by inflating scores

**Expected impact: high when practice remains mostly no-basis misses.** Keep a small active family for teaching. After an unaided miss, demonstrate the contrast and offer a clearly labeled pair-choice or broad-family practice item if needed. Fade back to a new, unboxed full-map pin. Credit useful partial reasoning without changing the recorded wrong pin.

Trial a **70% to 85% correct band for supported practice**, not for the unrestricted assessment. If performance stays below about 60% over twenty fresh supported attempts, add a clear worked example or reduce the current alternatives. If it is above 85% across sessions, fade support or widen alternatives. These are operating heuristics. Two-choice accuracy, exact-region accuracy, and reported spotting must have separate denominators.

**Evidence basis:** the [85% model](https://doi.org/10.1038/s41467-019-12552-4) concerns particular binary learning models, not an established human GeoGuessr target. [Fading plus principle prompts](https://doi.org/10.1037/0022-0663.95.4.774) was tested in problem solving. [Motivation and success rate](motivation-and-success-rate.md) gives the limits.

**Measurable check:** record supported success, hint use, unaided fresh-pin performance, and session return separately. Keep scaffolding if next-day unboxed performance improves without persistent hint dependence. A higher supported percentage alone is not success. A learner who enjoys the session more but transfers nothing needs better teaching content, not only easier questions.

### 4. Shorten diagnosis and close the session with practice

**Expected impact: moderate after the teaching content is fixed.** Replace the obligatory long cold block with two to four minutes on three to five fresh scenes. Use about six minutes for one or two unresolved contrasts, followed by five to ten minutes of mixed new-scene pins. Finish with two minutes recalling one conditional rule and selecting a review. This gives a roughly 15 to 25 minute session with real decisions after study, rather than ten minutes of reading at the end.

Keep the three-region study option when those regions have enough observations and enough time remains for retrieval. Do not force three just because the routine names three. Revisit with new locations the next day and around a week later. The current sprint is not using FSRS, so changing the general FSRS retention setting would not fix this pack. See [spacing and scheduling](spacing-and-scheduling.md).

**Evidence basis:** [pretesting research](https://doi.org/10.1007/s10648-023-09814-5) supports an attempt before learning, not a required 15-minute block. [Spacing research](https://pubmed.ncbi.nlm.nih.gov/19076480/) supports distributed review, not these exact dates or session lengths.

**Measurable check:** compare this structure with the proposed routine at equal total time across several sessions. Use separate held-out road sets for next-day and week-later tests. Report mean score on one fixed scale, median distance, the fraction of misses over 1,000 km, and counts. Record frustration and completion as secondary outcomes. A small single-learner comparison is practical evidence for Seth, not a population causal estimate.

## Guardrails for every check

All items below are **Inference**.

- Hold out localities or road corridors, not just image files or neighboring frames.
- Keep the test region mix, viewing constraints, and scoring scale comparable.
- Separate first-seen, repeated, hinted, and post-reveal self-reported outcomes.
- Do not call a panorama unseen if it appeared in a feedback gallery.
- Use the same feedback policy within each assessment block. A clean test can defer explanations until the short block ends.
- If repeated-image results rise but new-location results do not, improve cue validity, example diversity, or category granularity before increasing repetition.
