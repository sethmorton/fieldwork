# Motivation and success rate

## The 85% rule is a model result

**Limited.** Wilson and colleagues derived an optimal training accuracy of about 84.13% under particular assumptions about noisy binary classification and gradient-based learning. They demonstrated the result in artificial networks and a biologically motivated perceptual-learning model. They did not randomize human GeoGuessr players to different success rates, test free-coordinate pinning, or establish a motivational threshold. [Wilson and colleagues, 2019](https://doi.org/10.1038/s41467-019-12552-4).

**Limited.** The exact value depends on model assumptions. The paper's headline is useful as a reminder that maximum difficulty is not always maximum learning. It does not imply that 84% is good and 83% is bad, that every task needs the same rate, or that an 8% rate proves no learning occurred. Binary classification in the model also differs from an unrestricted map task with many possible answers. [Wilson and colleagues](https://doi.org/10.1038/s41467-019-12552-4).

## Heavy failure is not the same as useful challenge

**Moderate.** Failed pretests can improve later learning when followed by correct information. Thus a low cold score can coexist with useful learning. The key experiments included unsuccessful knowledge questions or word associates followed by answers. They did not test indefinite sessions of poorly understood visual-region errors. [Kornell, Hays, and Bjork, 2009](https://pubmed.ncbi.nlm.nih.gov/19586265/).

**Moderate.** Self-determination research links support for competence and autonomy with motivation. It supplies a reason to make progress understandable and retain learner control. It does not establish how much failure Seth will tolerate or a fixed success percentage that prevents discouragement. [Ryan and Deci, 2000](https://pubmed.ncbi.nlm.nih.gov/11392867/).

**Strong.** Feedback-intervention research shows that feedback can hurt performance, especially when it redirects attention away from the task toward the self. Negative versus positive feedback sign did not explain the whole pattern. Replace a punitive score emphasis with useful information, not with empty praise or false success. [Kluger and DeNisi, 1996](https://doi.org/10.1037/0033-2909.119.2.254).

**Local observation.** Accept Seth's reported 8% spotted over 24 rounds as his experience. This is a small, task-specific sample, not an independently measured long-run region accuracy. Do not silently convert the rounded percentage into an exact numerator. Do not equate spotted, correct EPA region, correct broad family, and useful geographic pin. The current code retains geographic and recognition-related outcomes separately and allows explicit overrides. See [session.mjs](../../src/session.mjs).

**Inference.** The practical concern is whether misses supply a usable next action and whether Seth returns for another session. Near-zero success plus unreadable feedback is a poor default even though the precise causal contribution of each has not been measured here.

## Scaffold, then fade

**Moderate.** Atkinson, Renkl, and Merrill tested fading worked solution steps together with prompts to identify the underlying principle. Across two problem-solving experiments, the combined approach improved near and far transfer. Fading alone was not an established far-transfer solution. This supports guided transitions to independence, not a proven vegetation hint schedule. [Atkinson and colleagues, 2003](https://doi.org/10.1037/0022-0663.95.4.774).

All recommendations below are **Inference**.

1. Start each ordinary trial without hints. After a miss, give a worked contrast tied to the exact image.
2. When there is no usable model, let a short teaching block offer a pair choice or broad scene-family judgment. Label that as supported practice, not a normal full-map result.
3. On a different scene, ask Seth to find or name the cue without boxes. Offer a hint when needed and record the hint separately.
4. Remove the pair choices and return to a full-map pin on another fresh scene. Keep the original assessment difficulty unchanged.
5. Fade support after success across different locations and days, not after recognizing a repeated screenshot. Restore support when performance drops, without erasing earlier progress.

**Inference.** Trial a 70% to 85% supported-practice band. Below about 60% over twenty fresh supported attempts, add one clear example or narrow the current family. Above 85% across sessions, reduce support or add alternatives. These are adjustable operating rules. They are not derived confidence bounds and do not justify holding a learner back until a numerical gate is met.

**Inference.** Give precise credit for partial reasoning, such as identifying wet coastal flats even when the pin is too far north. Keep the actual pin result unchanged. A correct broad family is useful feedback, not a retroactive correct EPA region. Do not make a two-choice task trivially easy just to hit a dashboard target.

## Measurable check

**Inference.** Keep separate counts for unaided fresh pins, supported classifications, repeated-image trials, and self-reported spotting. Track how often a hint is needed, whether a rule can be applied on a new scene, and whether Seth chooses to return. Ask a brief frustration rating if it helps interpret abandonment. Improved mood or completion alone is not enough. Keep scaffolding if next-day unboxed pinning improves without dependence on hints.
