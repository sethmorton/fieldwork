# Spacing and scheduling

## Spacing is not one magic interval

**Strong.** Distributed practice generally supports durable retention. Cepeda and colleagues taught facts to more than 1,350 people, varied the gap before review, and tested retention at delays up to a year. The most useful gap increased with the retention horizon. Too short and too long were both worse than an intermediate gap. This was fact learning, not an experiment establishing next-day and week-later intervals for vegetation. [Cepeda and colleagues, 2008](https://pubmed.ncbi.nlm.nih.gov/19076480/).

**Moderate.** Expanding intervals are not universally better than equal intervals. Karpicke and Roediger found expanding retrieval benefited vocabulary retention after ten minutes, while equally spaced retrieval did better after two days. Delaying the first retrieval mattered more than expansion itself in their experiments. Equal total practice and the first gap matter when comparing schedules. [Karpicke and Roediger, 2007](https://pubmed.ncbi.nlm.nih.gov/17576148/).

**Moderate.** Adaptive category sequencing is closer to this drill than vocabulary recall. Mettler and Kellman used butterfly genera, tracked accuracy and response time, and assessed familiar and unfamiliar images immediately and after a week. Adaptive practice improved learning efficiency relative to random sequencing. The tested package also involved mastery-based retirement, so its benefit cannot be attributed to interval adaptation alone. It does not establish FSRS as the best perceptual-learning scheduler. [Mettler and Kellman, 2014](https://doi.org/10.1016/j.visres.2013.12.009).

**Inference.** Schedule the region or scene family while changing the panorama and locality. A failure should lead to clearer teaching and another example after intervening items, then a later-day check. Do not make the same photograph recur until it becomes familiar and call that regional learning.

## FSRS: what it does and does not establish

**Limited.** FSRS models memory difficulty, stability, and retrievability to choose review timing from graded review histories. The related memory-model and scheduling work by Ye, Su, and Cao concerns optimizing spaced repetition cost under modeled memory dynamics. A model-based scheduling objective is not evidence that the resulting schedule optimizes geographic generalization or motivation. [Ye, Su, and Cao, 2022](https://doi.org/10.1145/3534678.3539081).

**Local observation.** Fieldwork's general adaptive path uses FSRS-6 with desired retention 0.9, as documented in [ARCHITECTURE.md](../ARCHITECTURE.md). That value is a scheduler setting, not a prediction that Seth will identify 90% of unseen regions.

**Local observation.** The current `us-vegetation` pack uses `scheduler: 'sprint'`, not the general FSRS path. [sprint.mjs](../../src/sprint.mjs) uses round-count review gaps of five after a miss and twenty while learning, plus a delayed check after at least twelve hours. Pool and set-filling rules can change which due item appears. Its state-cell coverage requirement checks exposure, not successful recognition in every state.

**Inference.** Do not tune FSRS retention to solve this sprint's low success rate. First fix explanations, example coverage, and task difficulty. A memory scheduler cannot create a missing category representation, repair a wrong cue, or establish transfer from a post-reveal self-rating.

## Session length and success targets

**Limited.** The cited spacing studies manipulate gaps and retention, not a universal ten-minute concentration limit. The earlier local analysis observed worse first-exposure performance in long sittings, but content order and fatigue were confounded. Neither that observation nor the literature establishes a precise session cutoff for Seth.

**Inference.** Begin with a 15 to 25 minute complete session, including feedback, rather than an obligatory 10 to 15 minutes of cold failure followed only by reading. Stop earlier when guesses become random or the explanation cannot be restated. The duration is a practical budget that can be adjusted.

**Inference.** Use about 70% to 85% correct as an initial operating band for a clearly defined supported practice task, such as a small-family classification. This band is not a validated GeoGuessr optimum. A full-map pin, a two-choice contrast, and an exact EPA region judgment have different difficulty and chance structure. Keep their rates separate. The [85% model and its limits](motivation-and-success-rate.md) do not justify inflating scores on repeated pictures.

**Inference.** A sustained near-zero rate is a reason to diagnose the task. Brief pretesting can help despite errors, but repeating unsupported failure is not automatically desirable difficulty. If supported practice stays below about 60% over twenty fresh attempts, simplify the distinction or add a worked example. If it stays above 85% across sessions, fade support or widen the alternatives. These thresholds are pilot rules, not statistical change points or permanent mastery criteria.

## A simple session and review plan

All numbers and steps below are **Inference**.

1. Spend two to four minutes on three to five fresh cold scenes. Withhold explanation until this short diagnostic block ends if a clean baseline matters.
2. Spend about six minutes resolving one or two confusions. Use a clear worked contrast, then alternate new examples of both regions. A third region is optional, not mandatory.
3. Spend five to ten minutes on unboxed pins with brief explanations after each. Include an older family and some representative non-target scenes.
4. Finish with two minutes to recall one conditional rule and choose a next review. Use new scenes on the next day and around a week later as practical checkpoints.

**Inference.** Keep the same total learning time when comparing this with the proposed cold-test-then-study routine. Do not count more screen time as a scheduling benefit. Keep assessment locations out of training even when the scheduler runs out of fresh examples.

## Measurable check

**Inference.** Compare equal total training spread across days with training concentrated into one sitting. Use comparable region families and different held-out roads. At a week delay, compare mean pin score on a fixed scoring scale, median distance, confusion rates, and response time. Improvement only on the exact repeated panorama is item memory, not enough evidence of better scheduling for the intended task.
