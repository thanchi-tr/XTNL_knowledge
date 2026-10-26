# r-psych: a 5-second psychological check-in, evidence first

Date: 2026-10-27. Scope: research only, read-only on the repo. No DB, no prisma, no Gemini, no secrets touched.

---

## 0. TL;DR (the recommendation in one screen)

**The check-in ("Check in", two taps, about 3 s once the sheet is open):**

1. **Tap 1: a mood grid** with pleasant on the x axis and energy on the y axis (Affect Grid / Mood Meter circumplex). Stored as `valence` and `energy`, each an integer from -4 to +4 (9 x 9, the Affect Grid's own resolution). One tap sets both.
2. **Tap 2: stress, five labelled buttons** (Elo single item anchors: *Not at all, A little, Some, Quite a lot, Very much*), stored 0-4. The second tap saves the check-in and shows "Logged 14:32" with Undo.
3. **Optional, never required:** one feeling word offered from the tapped quadrant (affect labelling), and up to 8 context tags (Slept badly, Work, Study, People, Alone, Moved, Unwell or pain, plus your own). Walks, rest days and sick days fill in on their own from data the app already has.

**When:** by default **one nudge a day** at a random time inside a window you choose (default 11:00-19:00). It is skipped if you checked in during the last 3 h, and it lapses silently after 60 min. **Close the day** uses the same grid in place of today's unlabelled 1-5 row, which gives a second, end-of-day point. You can check in any time from the Today card, the Android quick-settings tile or the cover-screen widget. An opt-in **"pattern fortnight"** mode sends 3 random prompts a day for 14 days and then switches itself off. The hard cap is 3 prompts a day.

**What you see back:** at the moment of logging, only a neutral receipt (no praise, no colour judgement). The mood view shows:
- a 14-day dot strip;
- **weekly medians** with their spread;
- a "changed" flag only when a weekly median moves **at least 2 grid steps** from your 4-week median (about twice the single-item measurement error) and the week has at least 4 check-ins;
- at most **one** "goes together" line a week (sleep, walks, tags), only after 21 or more days with 7 or more days in each group, always worded as association, not cause.

**Safety:**
- A "Need to talk?" link is always in the check-in footer.
- A gentle support card appears, at most once a week and always dismissible, when the last 7 days show a persistent low or high-stress pattern (§5.4). It lists **Lifeline 13 11 14** (text 0477 13 11 14), **Beyond Blue 1300 22 4636**, the **Suicide Call Back Service 1300 659 467** and **000** for emergencies, and suggests a GP.
- There is no suicide-risk question, because the app cannot respond to one.
- **PHQ-4** (PHQ-2 + GAD-2) and **PSS-4** are opt-in deeper checks, labelled "screening, not a diagnosis".

**Gamification:**
- **0 XP, never a streak source, never a must, debt, side-quest trigger or Momentum price.** No badge or reward ever depends on *what* mood you report.
- At most a neutral count ("12 check-ins this month") inside the mood view.
- This matches the existing REFLECTION rule (`src/lib/rituals.ts:579-597`).

---

## 1. What the repo has today (evidence)

| Fact | Evidence |
|---|---|
| Mood exists only as Close the day's 1-5, written as a REFLECTION ActivityEvent with `qty` = mood, `xp: 0`, `countsForStreak: false` | `src/lib/rituals.ts:552-597` (`MOOD_MIN=1`, `MOOD_MAX=5`, `reflectionEventInput`) |
| The 1-5 buttons are **bare numbers with no anchor labels** (nothing says which end is good), under the label "Mood" | `src/components/today/CloseDaySheet.tsx:133-141` |
| Mood is **write-only**: nothing in `src/` reads REFLECTION `qty` back. There is no trend, chart or summary | grep of `mood` across `src/` (roadmap-server.ts excluded): only the writer (`src/app/actions/rituals.ts:65-81`), the sheet and the board state (`src/components/today/TodayBoard.tsx:615-617, 2404-2421`) |
| Mood is captured only when the user closes the day, so it is retrospective, end-of-day and missing on days not closed | `TodayBoard.tsx:2404` (saved only inside the close flow) |
| REFLECTION is in `NEVER_STREAK_SOURCES` | `src/lib/streak-curve.ts:119-127` (REFLECTION at line 126) |
| `ActivityEvent` has one numeric `qty`, so a valence + energy + stress check-in does not fit one row | `prisma/schema.prisma:667-697` |
| Android Health Connect reads Exercise, Distance, Elevation and Weight only. **No sleep** (SleepSessionRecord) and no HRV | `android/app/src/main/java/com/xtnl/app/health/HealthReader.kt:7-12, 49-78` |
| The offline queue knows TICK, LOG and WORK_DONE (each with clientId and its own day). A check-in would be a natural 4th kind: never graded, so safe to queue, unlike review answers | `android/.../data/SendQueue.kt:22-63, 321-326` |
| The quick-settings tile is a single "Log a task" button that opens a deep link | `android/.../tile/LogTileService.kt:13-40` |
| Side-quest detectors read body minutes, musts, habit rungs and deadlines, **not mood** | `src/lib/side-quests.ts:42-50` |
| The cover screen is about 475 x 751 dp; the main screen about 704 x 932 dp | user memory `android-fold-app.md` |

**Gaps this exposes:**
- The current 1-5 row has no anchors.
- There is no energy or stress dimension.
- There is no momentary capture.
- Nothing is shown back. Users in interview studies say this is the main reason they abandon mood tracking (Schueller et al. 2021, §3.2).

---

## 2. EMA design and burden: how often, how long

- **Pooled compliance is about 80%, and 1-3 prompts a day does best in non-clinical adults.** Williams et al. (JMIR 2021) is a systematic review and meta-analysis of mobile EMA (168 studies; 68 datasets pooled):
  - overall compliance 81.9% (95% CI 79.1-84.4);
  - non-clinical compliance **87.0% at 1-3 prompts a day**, against 76.9% at 4-5 and 79.4% at 6 or more;
  - questionnaires with **more than 26 items had the lowest compliance (63%)**;
  - incentives were not significant;
  - heterogeneity above 90%, and reporting was poor.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7970161
- **The number of prompts did not predict compliance across 477 articles, but incentives did.** Wrzus and Neubauer (Assessment 2023): 496 samples, typical design about 6 prompts a day for 7 days, about 79% compliance. https://heibib.ub.uni-heidelberg.de/search/Record/1839595345
- **Questionnaire length, not frequency, drove burden in Eisele et al. (Assessment 2022).** Randomised design: 30 vs 60 items at 3, 6 or 9 prompts a day for 14 days. https://cris.maastrichtuniversity.nl/en/publications/the-effects-of-sampling-frequency-and-questionnaire-length-on-per/
  - A reanalysis of the same data (Ulitzsch et al.) found that **higher frequency did raise careless responding**, and that careless responding was *not* visible in the compliance numbers. https://www.leibniz-ipn.de/en/research/publications/investigating-the-effect-of-experience-sampling-study-design-on-careless-and-insufficient-effort-responding-identified-with-a-screen-time-based-mixture-model
  - Implication: a high answer rate can hide junk. Keep the prompt count low and the item count tiny.
- Alcohol EMA, **preprint, not peer reviewed** (Ke et al., JMIR Preprints 2026): pooled compliance 81% across 21 studies, and prompting frequency predicted lower compliance (b = -0.039), while study duration did not. https://preprints.jmir.org/preprint/108297
- Youth EMA compliance is about 72% and falls about 0.8 points per publication year (Drexl et al., JMIR 2025). https://pmc.ncbi.nlm.nih.gov/articles/PMC12079076
- **Micro-EMA (μEMA)** is the closest research analogue to a "5-second action": one cognitively simple question per interruption, answered at a glance with one tap.
  - It was designed around "microinteractions" of about 3-4 s.
  - In the TIME study (81 young adults, at least 6 months, 662,397 questions delivered), compliance was 67.6% and completion 79%. Very high-frequency prompting still costs some compliance. Ponnada et al., JMIR Formative Research 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC8867293 . 2025 review: https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2025.1564657/pdf

**Design consequence:** 2-3 items, 1-2 taps, and 1 prompt a day by default (3 at most). Measure time-to-save in the client so the "5 s" claim is checked against real use, not asserted.

---

## 3. What a 5-second interaction can validly capture

### 3.1 Single items: valid enough for trends, noisy at the single point

- **Single-item stress (Elo, Leppänen and Jahkola, Scand J Work Environ Health 2003).**
  - The item: "Stress means a situation in which a person feels tense, restless, nervous or anxious or is unable to sleep at night because his/her mind is troubled all the time. Do you feel this kind of stress these days?", answered on a 5-point scale from "not at all" to "very much".
  - Validity was judged on four datasets, N = 1015 in the Nordic sample, by convergence with exhaustion, mental-health, sleep and vitality scales.
  - The authors concluded it can replace longer stress scales in survey research.
  - https://www.sjweh.fi/article/752 ; PDF https://meps.ipums.org/meps/resources/Elo_et_al_2003.pdf
  - Note: I could not see the exact coefficients. The item was validated with a "these days" recall window, so using it as a momentary "right now" rating is an adaptation.
- **0-10 single stress items** are widely used in EMA trials (for example, 3 random daily texts rating stress 0-10, NCT05408832), but **I found no psychometric validation of a single 0-10 momentary stress item.** https://clinicaltrials.gov/study/NCT05408832 . This is why the design uses Elo's 5 labelled anchors rather than an unlabelled 0-10.
- **Single-item depressed mood (VAS):**
  - In 812 anxiety-clinic patients it correlated r = 0.71-0.78 with the 21-item BDI, described as "a reasonable rough guide to mood". https://pubmed.ncbi.nlm.nih.gov/10448454
  - In 284 students, a single-item VAS mood scale classified dysphoria about as well as established scales (Killgore). https://experts.arizona.edu/en/publications/the-visual-analogue-mood-scale-can-a-single-item-scale-accurately/
  - In psychiatric outpatients, single-item severity ratings discriminated full remission, partial remission and an episode (Zimmerman 2006). https://www.psychiatrist.com/jcp/developing-brief-scales-clinical-practice-reliability/
- **How noisy one momentary rating is.** Dejonckheere et al. (Psychological Assessment 2022/2023, 35(3):189-204) repeated an item within the same survey. On a 0-100 slider:
  - measurement error was **about a tenth of the scale (about 8 points)**;
  - **about 27% of within-person variance was noise**;
  - ratings near the scale ends had less error.
  - https://research.tilburguniversity.edu/en/publications/assessing-the-reliability-of-single-item-momentary-affective-meas/ ; summary https://blog2.m-path.io/blog/blog-1/how-do-you-assess-the-reliability-of-single-item-ratings-in-esm-ema-28
  - **Implications:**
    - Finer resolution than about 10 levels per axis buys nothing, which is why the design uses 9 levels per axis.
    - A one-step change between two check-ins is noise.
    - Show aggregates, not point-to-point swings.
- **Slider/VAS vs Likert in EMA** (Haslbeck et al., Behavior Research Methods 2025, randomised, 14 days): the VAS gave somewhat stronger correlations with psychopathology criteria. There were no reliable differences in missing data, duration or the user's experience. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12222338/ . A continuous-position tap on a grid gets most of that benefit.

### 3.2 Valence x arousal (circumplex) in one tap

- **Affect Grid** (Russell, Weiss and Mendelsohn, JPSP 1989, 57:493-502):
  - a 9 x 9 grid with pleasantness on x and arousal on y;
  - built explicitly for rapid, repeated use;
  - adequate reliability and validity in 4 studies.
  - https://arc.psych.wisc.edu/self-report/affect-grid-agrid/
  - The independent check (Killgore 1998, N = 284) found it **"moderately valid" for general pleasure and arousal, with little power to separate specific emotions**. https://experts.arizona.edu/en/publications/the-affect-grid-a-moderately-valid-nonspecific-measure-of-pleasur/
  - That limit is exactly why an *optional* word is added (below).
- **Mood Meter / How We Feel** (Brackett, Yale Center for Emotional Intelligence):
  - pleasantness x energy, in four coloured quadrants;
  - the app version has 144 feeling words; you check in, then optionally tag and journal the context.
  - It shows the grid-then-word interaction works at consumer scale.
  - https://marcbrackett.com/how-we-feel-app-3/ ; https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/
- **What users want** (Schueller, Neary, Lai and Epstein, JMIR Mental Health 2021; 22 interviews + card sort). https://pmc.ncbi.nlm.nih.gov/articles/PMC8387890/
  - Users were overwhelmed by too many mood options and **disliked numeric ratings**.
  - **Sliders** were praised for nuance; a **few words or emojis** felt "just right".
  - Users valued **custom terms**.
  - Some **avoided entering negative moods**, and summaries from sparse data felt meaningless.
  - Users wanted **interpretation**, not only data.
  - Tracking typically started after a bad patch.
- **Mood-tracking apps** (Caldeira et al. 2017, 32 apps) support collection and reflection well, but preparation and **action** poorly. https://pubmed.ncbi.nlm.nih.gov/29854114/

### 3.3 Why an optional emotion word (and only optional)

- **Affect labelling.** Putting feelings into words reduced amygdala response to negative images (Lieberman et al., Psychological Science 2007). https://sites.lifesci.ucla.edu/psych-sanlab/wp-content/uploads/sites/31/2016/03/Lieberman_2007_PsychScience.pdf
- **Emotion differentiation.** Fine-grained labelling is linked to better regulation under stress (Kashdan, Barrett and McKnight 2015). https://www.affective-science.org/pubs/2015/kashdan-et-all-unpacking-emotion-differentiation-2015.pdf
- Both are reasons to *offer* a word. Neither makes it required, and a required word would break the 5 s budget.

### 3.4 Deeper, occasional checks (not 5 s; opt-in)

- **PSS-4** (4 items, past-month recall). It is reliable with acceptable psychometrics in large samples:
  - English norms in Warttig et al. 2013, N = 1568;
  - a German representative sample, N = 2527, needed a method factor for response style.
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11742941/ ; https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1648070/full
  - Cadence: **monthly**, matching its recall window.
- **PHQ-4 = PHQ-2 + GAD-2** (2-week recall), validated in 2149 US primary-care patients (Kroenke et al., Psychosomatics 2009). https://fis.uke.de/portal/en/publications/an-ultrabrief-screening-scale-for-anxiety-and-depression-the-phq4(3969b34b-29e4-403d-ba80-11112c46edcb).html
  - **PHQ-2 at 3 or more:** sensitivity 0.72, specificity 0.85 against semi-structured interviews. Individual-participant meta-analysis, 100 studies, 44,318 participants (Levis et al., JAMA 2020). It is a *screen*, best followed by the PHQ-9 or a clinician. https://researchportalplus.anu.edu.au/en/publications/accuracy-of-the-phq-2-alone-and-in-combination-with-the-phq-9-for/
  - **GAD-2 at 3 or more:** sensitivity 0.76, specificity 0.81 for GAD, with wide CIs (Plummer et al., Gen Hosp Psychiatry 2016). https://pubmed.ncbi.nlm.nih.gov/26719105/
  - Cadence: **every 2 weeks at most**, opt-in.
  - Wording: "questions GPs use to decide whether to talk more; not a diagnosis".
- **I-PANAS-SF** (10 items; Thompson 2007) is psychometrically acceptable but too long for 5 s. It suits only an occasional research-style check. https://www.citedrive.com/en/discovery/development-and-validation-of-an-internationally-reliable-short-form-of-the-positive-and-negative-affect-schedule-panas
- **Sleep quality as a context field:** the Single-Item Sleep Quality Scale (0-10, 7-day recall; Snyder et al., JCSM 2018) correlated strongly with the PSQI and MQI in clinical samples. https://pmc.ncbi.nlm.nih.gov/articles/PMC6223557
  - It could later become an optional morning "How did you sleep?" item. For the 5 s check-in, a "Slept badly" tag is enough.

---

## 4. Sampling: once vs several times a day, fixed vs random

- **End-of-day ratings track the day's momentary average reasonably well.** Neubauer, Scott, Sliwinski and Smyth (JPSP 2020; N = 242 and N = 175) found relatively high convergence between aggregated momentary and end-of-day affect. **End-of-day negative affect was rated more intense** (the memory-experience gap; peak-end). https://pmc.ncbi.nlm.nih.gov/articles/PMC6842033
  - For pain, end-of-day vs momentary r was .90-.92. https://researchconnect.stonybrook.edu/en/publications/can-end-of-day-reports-replace-momentary-assessment-of-pain-and-f/
  - So the existing Close the day point is worth keeping, but it should not be the *only* point.
- **Recall bias grows with depressive symptoms.** People with mild depressive symptoms overestimated negative affect and underestimated positive affect in recall. https://link.springer.com/article/10.1007/s10608-020-10122-3
  - Recalled mood changes agreed poorly with EMA instability indices (Psychological Assessment 2009). https://pubmed.ncbi.nlm.nih.gov/19719353
  - So at least one momentary (non-recall) point a day matters.
- **Mood varies by time of day**, and the reported shapes differ by sample. Stone et al. (Emotion 2006; 909 working women; Day Reconstruction Method) found positive affect peaking at noon and in the evening. Student samples show a linear rise across the day. https://pdodds.w3.uvm.edu/files/papers/others/2006/stone2006a.pdf
  - A fixed time captures the same slice every day. That is comparable across days, but it never samples other parts of the day.
  - A random time inside a window spreads coverage.
- **Fixed vs random compliance: the evidence is weak and mixed.** Some meta-analyses link fixed times to higher compliance; others do not. The "random reduces anticipation" claim is mostly vendor guidance; I found no peer-reviewed test of it. "Random" schedules are in practice constrained-random inside windows. https://m-path.io/blog/predictors-of-response-compliance-in-esm-ema-research-10 ; https://cs.dartmouth.edu/dfk/research/mishra-ema-tr/mishra-ema-tr.pdf
- **Self-initiated entries are biased toward salient moments.** People start and continue tracking around bad patches, and some skip negative moods (Schueller 2021). Missing data in EMA is mostly systematic, not random. https://repub.eur.nl/pub/113510/REPUB_113510_OA.pdf
  - **Store whether each check-in was prompted, self-initiated or part of Close the day**, so summaries can say "3 of your 9 check-ins were prompted".
- **Structured intense periods** are a design idea Schueller et al. raise explicitly. That is the origin of the opt-in "pattern fortnight".

**Chosen schedule:**
- One semi-random daily nudge in a user window, plus the end-of-day point, plus self-initiated entries anytime.
- Cap 3 prompts a day.
- Optional 14-day 3-a-day mode.

The grounds:
- 1-3 prompts a day gave the best non-clinical compliance (Williams 2021).
- Frequency raises careless responding (Ulitzsch).
- End-of-day converges with the momentary average but inflates negative affect (Neubauer 2020).

---

## 5. Reactivity, showing trends, and safety

### 5.1 Does tracking change mood? (measurement reactivity)

- Suicide-research EMA (Kivelä, van der Does, Riese and Antypa, Frontiers in Digital Health 2022): "no evidence was found of systematic reactivity of mood or suicidal ideation to repeated assessments", described as tentative because few studies tested it. https://frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2022.876595/full
  - A Leiden thesis reports that 18% of participants *felt* EMA sometimes triggered ideation, without a measurable rise. https://scholarlypublications.universiteitleiden.nl/access/item%3A3677207/view
- Two randomised studies found no reactivity effect:
  - in a randomised ESM study (90 participants reporting positive, negative or neutral states), no change in momentary emotions or depressive symptoms; https://pmc.ncbi.nlm.nih.gov/articles/PMC6597111
  - in bereaved adults, ESM self-monitoring did not change depression symptoms against a waitlist; https://pmc.ncbi.nlm.nih.gov/articles/PMC5451128
  - (the attribution of these two studies rests on the search excerpts).
- **There is a possible benefit.** In an RCT in Australian GP patients aged 14-24 (Kauer et al., JMIR 2012), mobile self-monitoring of mood, stress and coping raised emotional self-awareness, which in turn predicted fewer depressive symptoms. https://www.jmir.org/2012/3/e67/
- **Health-behaviour reactivity** is the subject of a 2022 meta-analysis (König et al., Health Psychology Review 16(4):551-575). I could not retrieve its abstract or effect sizes, so it is not relied on here. https://eref.uni-bayreuth.de/id/eprint/68937/
- **Theoretical risk: rumination.** An excessive focus on negative states can prolong depression (JMIR Formative 2022). https://formative.jmir.org/2022/12/e40045/PDF
  - Mitigation: a short entry, no forced reflection on bad moments, no streak pressure, and an easy way to pause tracking.

### 5.2 Showing trends without over-interpreting

- **Noise floor.** About 27% of within-person variance in one rating is noise, so the error is about 1 grid step (Dejonckheere, §3.1). **Show weekly medians with their spread, and flag a change only at 2 or more steps with 4 or more check-ins that week.** That rule is my derivation from the error estimate, not a published cutoff.
- **Variability.** Within-person variance in affect is reliable when aggregated over many points (within-person reliability .73-.91 across 7 diary and EMA studies; Scott et al. 2020). https://stacks.cdc.gov/view/cdc/217574
  - Instability indices such as RMSSD mix variance and autocorrelation. https://pmc.ncbi.nlm.nih.gov/articles/PMC8381239/
  - At 1-2 points a day, show a "steady / up and down" description only after 3 or more weeks, not a numeric index.
- **Personal correlations.** Group findings often do not hold for an individual (Fisher, Medaglia and Jeronimus, PNAS 2018). https://pmc.ncbi.nlm.nih.gov/articles/PMC6142277
  - So use only the user's own data, wait for enough days (21 or more, 7 or more in each group), show the difference with the n, and always say "went together, not proof that one causes the other".
- **Known associations, for context only:**
  - **Sleep and next-day mood** are linked in both directions in naturalistic studies (Konjarski et al., Sleep Med Rev 2018, 42:47-58). https://doi.org/10.1016/j.smrv.2018.05.005
  - **Physical activity** goes with higher energetic arousal and positive affect and lower *calmness* within persons, with **small** effects. This comes from an individual-participant meta-analysis of 67 datasets, 8223 people and about 321k ratings (Rehder et al., Nature Human Behaviour 2026). https://iro.uiowa.edu/esploro/outputs/journalArticle/An-individual-participant-data-meta-analysis-of/9985163468202771
  - A systematic review of 32 studies found the positive-affect link fairly consistent and the negative-affect link mixed. https://pure.amsterdamumc.nl/en/publications/within-person-association-between-affect-and-physical-activity-re/
  - Implication: promise little. "Walk days" vs "no-walk days" is a fair, modest comparison. Do not show it as a reward for walking.

### 5.3 Signposting (Australia; the user is in Sydney). Verified 2026-10-27

From AIHW's crisis-helplines page (https://www.aihw.gov.au/suicide-self-harm-monitoring/resources/crisis-helplines-support-services) and Lifeline's own page (https://www.lifeline.org.au/get-help/topics/lifeline-services):

| Service | Contact | Hours |
|---|---|---|
| Emergency | **000** | 24/7 |
| Lifeline | **13 11 14**, text **0477 13 11 14**, online chat | 24/7 (all three, per Lifeline's site) |
| Suicide Call Back Service | **1300 659 467** | 24/7 |
| Beyond Blue | **1300 22 4636** (calls and webchat) | 24/7 |
| 13YARN (Aboriginal and Torres Strait Islander) | **13 92 76** | 24/7 |
| MensLine Australia | **1300 78 99 78** | 24/7 |
| Kids Helpline (5-25) | **1800 55 1800** | 24/7 |
| QLife (LGBTIQ+) | **1800 184 527** | 3pm-midnight |
| Medicare Mental Health (formerly Head to Health; not a crisis line) | **1800 595 212** | weekdays 8:30-5 (https://www.health.gov.au/ministers/the-hon-emma-mcbride-mp/media/national-head-to-health-phone-service-goes-live) |

- Lifeline's media page asks for the Mindframe guidelines to be followed. https://www.lifeline.org.au/resources/media-resources/
- Model line: "If you or someone you know needs help, phone Lifeline on 13 11 14."
- Store the numbers as one constant with a "checked on" date, because hours change.

### 5.4 What the app must do on persistent very low mood or high stress

The evidence base:
- EMA safety protocols in research (Kivelä 2022) use:
  - automatic messages directing to professional or emergency help;
  - safety plans, with "clear guidelines on seeking help should always be implemented";
  - clinician alerts.
- A personal app has **no clinician**, so the parts that transfer are the automatic signposting and always-available help information.

Recommended rules (thresholds are conservative heuristics, **not validated cutoffs**; no published cutoff exists for this scale):
1. **Always visible:** a quiet "Need to talk? Lifeline 13 11 14" link in the check-in sheet footer and in the mood view. It is tap-to-call on Android.
2. **Low-pattern card:** shown when, over the **last 7 days**, at least 5 distinct days have a check-in and on **5 or more of those days** the lowest valence was -3 or below (the bottom two rows), or stress was 4 ("Very much").
   - It is shown at most once every 7 days. It is dismissible, never blocking, never a modal, and never sent anywhere.
   - Wording: "This week looks heavy. You don't have to sort it alone." It lists the services above and suggests talking to a GP (who can arrange a Mental Health Treatment Plan).
   - It offers the opt-in PHQ-4.
   - The 7-day window echoes the PHQ's 2-week "more than half the days" logic at half the window. That echo is a reason, not evidence.
3. **PHQ-2 of 3 or more, or GAD-2 of 3 or more:** "These answers suggest it may be worth talking to a GP or one of the services below. This is not a diagnosis." Same services.
4. **Never:**
   - ask about suicidal thoughts or self-harm (the app can't respond, and PHQ-9 item 9 needs a clinician pathway);
   - use diagnostic words ("you are depressed");
   - alarm colours or red badges;
   - notify anyone;
   - send mood data, notes or words to Gemini;
   - show mood on the cover-screen widget, lock screen or notification text (the Fold's cover screen is visible to others).
5. **Opt-out and pause:** "Pause check-ins for 1 week / 1 month" without losing data. Export and delete in Settings.

### 5.5 Regulatory and privacy notes (Australia)

- **TGA:**
  - Consumer health and wellness software may be **excluded** from regulation (exclusion 14A).
  - "Digital mental health tools" that assess, treat or self-manage are usually regulated unless they meet the 14E conditions, for example following established clinical guidelines displayed for user review.
  - A TGA review says the 14E exclusion may no longer be fit for purpose.
  - https://www.tga.gov.au/resource/examples-regulated-and-unregulated-software-excluded-software-based-medical-devices ; https://www.tga.gov.au/node/599859
  - Keep the check-in a **self-monitoring / wellbeing** feature: no diagnosis, no treatment claims. PHQ-4 and PSS-4 are shown with their scoring rules, not interpreted beyond "may be worth talking to a GP".
  - I could not open the TGA PDF (timeout), so this is a risk to check if the app is ever distributed beyond personal use.
- **NSQDMH Standards** (ACSQHC 2020) cover digital mental-health *services*; general wellness apps are excluded. They are voluntary. https://www.safetyandquality.gov.au/national-standards/national-safety-and-quality-digital-mental-health-standards
- **Privacy Act / APPs:**
  - Mood logs and screening scores are **health information, which is sensitive information**. It needs express, informed, current consent and an APP 5 collection notice.
  - Small-business and non-commercial exemptions may apply to a personal app, but design as if covered.
  - https://www.safetyandquality.gov.au/sites/default/files/2022-11/action_guide_-_privacy.pdf ; https://accan.org.au/files/Grants/PeaceofMind

---

## 6. Gamification ethics

- **Rewards undermine intrinsic motivation.** Across 128 experiments (Deci, Koestner and Ryan, Psychological Bulletin 1999), engagement-contingent rewards gave d = -0.40 on free-choice motivation and completion-contingent rewards d = -0.36. https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf
  - Even rewarding the *act* of checking in has a cost.
- **Research incentives raise compliance** (Wrzus and Neubauer 2023), but research pays per prompt regardless of content. Paying for *content* (good mood) would turn the measure into a target. I found **no study** that directly tests incentive-induced mood misreporting; that is a gap, and the argument rests on reasoning.
- **Gamified mental-health tools** face an engagement-efficacy-ethics trade-off: pushing engagement can fail to improve, or can undermine, efficacy. Gamification should support autonomy and progress, not pressure. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11638686/ ; https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11353921/
- **Rules for XTNL** (consistent with `rituals.ts:579-597` and `streak-curve.ts:126`):
  - xp 0;
  - never a streak source;
  - never a must, habit or duty;
  - a missed check-in is never a debt and never "held";
  - never priced by Momentum;
  - never read by side-quest detectors;
  - no badge, level, title or animation that depends on the mood value;
  - no "great mood!" praise and no sad-face for low moods;
  - the post-save haptic is the same neutral tick for every value (`feel/Scores.kt`);
  - at most a neutral count inside the mood view;
  - no social or leaderboard surface.
- If the user later wants a small reward, the least harmful version is a flat, content-blind **one-time weekly** acknowledgment for having 4 or more prompted check-ins. It would be outside the streak and the XP economy. It is not recommended by default.

---

## 7. Recommended design, with evidence for each choice

| Choice | Default | Why (evidence) |
|---|---|---|
| Dimensions | Valence + energy (grid) + stress (5 levels) | Circumplex single-tap grid is moderately valid for pleasure and arousal (Russell 1989; Killgore 1998). Stress is asked separately because the user asked for it and Elo's single item is validated (Elo 2003). |
| Grid resolution | 9 x 9, stored -4..+4 on both axes | Affect Grid resolution. Single-item error is about 10% of the scale (Dejonckheere), so finer is wasted. Cover screen: (475 - 32) / 9 is about 49 dp per cell, at or above the 48 dp target. At a 344 px web width cells are about 35 px, acceptable because a tap within ±1 cell is inside the error. The grid is drawn as 4 soft quadrants, not 81 buttons; the tap position snaps to the nearest cell. |
| Grid labels | Corners: "Tense, wired" (top-left), "Excited, upbeat" (top-right), "Low, drained" (bottom-left), "Calm, content" (bottom-right). Axes: "Unpleasant ↔ Pleasant", "Low energy ↔ High energy". | Unlabelled numbers are what users dislike (Schueller 2021). Today's 1-5 row has no anchors (`CloseDaySheet.tsx:133-141`). |
| Stress scale | 5 buttons: Not at all / A little / Some / Quite a lot / Very much (0-4), asking "How stressed are you right now?" | Elo's 5-point "not at all → very much" (validated with "these days" recall; momentary use is an adaptation). No validation found for an unlabelled 0-10 single stress item. |
| Taps to save | 2 (grid, then stress). Undo for 5 s. | μEMA: one question at a glance, 3-4 s microinteractions (Ponnada 2022). Long questionnaires hurt compliance (Williams 2021; Eisele 2022). |
| Feeling word | Optional: 6 words from the tapped region, plus "+ my own" | Affect labelling (Lieberman 2007); granularity (Kashdan 2015). Custom terms valued (Schueller 2021). Optional so it stays within 5 s. |
| Context tags | Optional, at most 8 visible: Slept badly, Work, Study, People, Alone, Moved, Unwell or pain, plus custom. Walks, rest and sick days filled in from existing data. | Context and trigger linking is why users track (Schueller 2021). Sleep-mood is bidirectional (Konjarski 2018). Activity and affect have small within-person links (Rehder 2026). |
| Prompt schedule | 1 a day, random within a user window (default 11:00-19:00), skipped if a check-in in the last 3 h, lapses after 60 min, quiet hours respected | 1-3 a day had the best non-clinical compliance (Williams 2021). Frequency raises careless responding (Ulitzsch). Random-in-window spreads diurnal coverage (Stone 2006); fixed vs random evidence is weak. |
| End-of-day point | Close the day uses the same grid and stress row (replacing the 1-5 row) | End-of-day converges with the momentary mean but overstates negative affect (Neubauer 2020). Kept as a labelled end-of-day point. |
| Intense mode | Opt-in "pattern fortnight": 3 a day random in morning, afternoon and evening windows for 14 days, then off | Structured intense periods (Schueller 2021). Burden is driven more by length than frequency (Eisele 2022), but careless responding rises with frequency, so it is time-boxed. |
| Trigger field | `prompted` / `self` / `close` stored on every check-in | Self-initiated entries are biased to salient moments and missingness is systematic (Schueller 2021; EUR paper). |
| Immediate feedback | "Logged 14:32" plus the quadrant name; same neutral haptic for every value | No reward for content (Deci 1999; §6). |
| Trend view | 14-day dot strip; weekly medians of valence, energy and stress with interquartile range; check-in count; "changed" flag at 2 or more steps vs the 4-week median with 4 or more check-ins that week | Single-item noise (Dejonckheere); aggregates are reliable (Scott 2020). |
| Associations | At most 1 a week, after 21 or more days and 7 or more days in each group; median difference with n; "went together, not proof of cause" | Group-to-individual non-generalisability (Fisher 2018); small effects (Rehder 2026). Users want interpretation (Schueller 2021). |
| Deeper checks | PHQ-4 every 2 weeks at most and PSS-4 monthly, both opt-in, labelled "screening, not diagnosis" | Kroenke 2009; Levis 2020 (PHQ-2 ≥3: 0.72/0.85); Plummer 2016 (GAD-2 ≥3: 0.76/0.81); PSS-4 one-month recall. |
| Safety | Always-on help link; low-pattern card (§5.4); no suicidality item; no data leaves the account; nothing on the cover screen or in notification text | Kivelä 2022 safety practice; AIHW and Lifeline numbers; privacy (APPs). |
| Gamification | xp 0, never streak, debt, must, side-quest or Momentum | `rituals.ts:579-597`; `streak-curve.ts:126`; Deci 1999. |

### 7.1 Data shape (proposal for the engineers; no DB work done here)

A dedicated model, because `ActivityEvent.qty` is a single number (`prisma/schema.prisma:667-697`):

```
model MoodCheck {
  id         String   @id @default(cuid())
  userId     String
  day        DateTime @db.Date      // life day (04:00 rollover, as reflectionDayAllowed)
  occurredAt DateTime
  valence    Int                    // -4..+4
  energy     Int                    // -4..+4
  stress     Int?                   // 0..4 (null if skipped)
  word       String?                // <= 24 chars
  tags       String[]               // <= 8
  trigger    String                 // "prompted" | "self" | "close"
  promptedAt DateTime?              // when the nudge fired, for latency
  clientId   String                 // offline-queue idempotency (SendQueue.kt pattern)
  createdAt  DateTime @default(now())
  @@unique([userId, clientId])
  @@index([userId, day])
}
```

Notes on the model:
- Keep the Close the day *note* as REFLECTION.
- Legacy REFLECTION `qty` 1-5 can be shown as "end-of-day mood (old scale)" mapped 1→-4, 2→-2, 3→0, 4→+2, 5→+4 on valence only, with no energy. It must be flagged as legacy, not merged silently.
- On Android, add `SendLine.Kind.CHECKIN`. A check-in is never graded, so queuing it offline is safe; it carries its own day and clientId, as TICK does.

### 7.2 Entry points

- **Today:** a compact "Check in" card.
- **Close the day:** the grid replaces the 1-5 row.
- **Android:** a second quick-settings tile, "Check in", that deep-links to a compact sheet.
- **Cover-screen widget:** a "Check in" button only, never the last value.
- **Notification:** neutral text ("Check in?"). Tapping it opens the sheet; a notification cannot host the grid.

### 7.3 Open questions for the user

1. Is the default nudge window 11:00-19:00 right, and do you want the nudge at all, or self-initiated plus Close the day only?
2. Should stress be 5 labelled levels (recommended) or a 0-10 row (more familiar, unvalidated, cramped at 344 px)?
3. Should the app ever offer the opt-in PHQ-4 and PSS-4, or stay strictly with single items?
4. Should mood be readable by any other feature (for example, Today suggesting a lighter plan on low-energy days)? The recommendation is **no** for now, because it would make the mood value change what the app asks of you, which edges toward rewarding or penalising a report.

---

## 8. Limits of this research

- Abstract or secondary-summary level only for:
  - Elo 2003 coefficients;
  - König 2022 (no abstract retrieved);
  - Konjarski 2018 (DOI only);
  - Stone 2006 curves;
  - the TGA exclusion text (fetch timed out).
- The Ke et al. 2026 alcohol-EMA meta-analysis is a **preprint**.
- No validation was found for a single 0-10 momentary stress item, or for any specific "persistent low mood" threshold on circumplex ratings. The thresholds in §5.4 are conservative heuristics.
- Measurement-reactivity evidence is mostly null but thin (few direct tests).
- Helpline hours were checked on 2026-10-27; re-check before shipping.

## 9. Sources (all URLs used)

- Williams et al. 2021, JMIR, mEMA compliance meta-analysis: https://pmc.ncbi.nlm.nih.gov/articles/PMC7970161
- Wrzus and Neubauer 2023, Assessment: https://heibib.ub.uni-heidelberg.de/search/Record/1839595345
- Eisele et al. 2022, Assessment: https://cris.maastrichtuniversity.nl/en/publications/the-effects-of-sampling-frequency-and-questionnaire-length-on-per/
- Ulitzsch et al., careless responding reanalysis: https://www.leibniz-ipn.de/en/research/publications/investigating-the-effect-of-experience-sampling-study-design-on-careless-and-insufficient-effort-responding-identified-with-a-screen-time-based-mixture-model
- Ke et al. 2026 (preprint): https://preprints.jmir.org/preprint/108297
- Drexl et al. 2025, youth EMA: https://pmc.ncbi.nlm.nih.gov/articles/PMC12079076
- Ponnada et al. 2022, μEMA TIME study: https://pmc.ncbi.nlm.nih.gov/articles/PMC8867293 ; 2025 review: https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2025.1564657/pdf
- Elo et al. 2003: https://www.sjweh.fi/article/752 ; https://meps.ipums.org/meps/resources/Elo_et_al_2003.pdf
- EMA stress 0-10 usage: https://clinicaltrials.gov/study/NCT05408832
- Affect Grid: https://arc.psych.wisc.edu/self-report/affect-grid-agrid/ ; Killgore 1998: https://experts.arizona.edu/en/publications/the-affect-grid-a-moderately-valid-nonspecific-measure-of-pleasur/
- Single-item mood VAS: https://experts.arizona.edu/en/publications/the-visual-analogue-mood-scale-can-a-single-item-scale-accurately/ ; https://pubmed.ncbi.nlm.nih.gov/10448454 ; https://www.psychiatrist.com/jcp/developing-brief-scales-clinical-practice-reliability/
- Dejonckheere et al.: https://research.tilburguniversity.edu/en/publications/assessing-the-reliability-of-single-item-momentary-affective-meas/ ; https://blog2.m-path.io/blog/blog-1/how-do-you-assess-the-reliability-of-single-item-ratings-in-esm-ema-28
- Haslbeck et al. 2025: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12222338/
- Schueller et al. 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8387890/
- Caldeira et al. 2017: https://pubmed.ncbi.nlm.nih.gov/29854114/
- Mood Meter / How We Feel: https://marcbrackett.com/how-we-feel-app-3/ ; https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/
- Lieberman et al. 2007: https://sites.lifesci.ucla.edu/psych-sanlab/wp-content/uploads/sites/31/2016/03/Lieberman_2007_PsychScience.pdf
- Kashdan et al. 2015: https://www.affective-science.org/pubs/2015/kashdan-et-all-unpacking-emotion-differentiation-2015.pdf
- PSS-4: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11742941/ ; https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1648070/full
- PHQ-4 Kroenke 2009: https://fis.uke.de/portal/en/publications/an-ultrabrief-screening-scale-for-anxiety-and-depression-the-phq4(3969b34b-29e4-403d-ba80-11112c46edcb).html
- Levis et al. 2020 JAMA: https://researchportalplus.anu.edu.au/en/publications/accuracy-of-the-phq-2-alone-and-in-combination-with-the-phq-9-for/
- Plummer et al. 2016 GAD-2: https://pubmed.ncbi.nlm.nih.gov/26719105/
- I-PANAS-SF: https://www.citedrive.com/en/discovery/development-and-validation-of-an-internationally-reliable-short-form-of-the-positive-and-negative-affect-schedule-panas
- Single-Item Sleep Quality Scale: https://pmc.ncbi.nlm.nih.gov/articles/PMC6223557
- Neubauer et al. 2020 JPSP: https://pmc.ncbi.nlm.nih.gov/articles/PMC6842033 ; end-of-day pain/fatigue: https://researchconnect.stonybrook.edu/en/publications/can-end-of-day-reports-replace-momentary-assessment-of-pain-and-f/
- Recall bias and depressive symptoms: https://link.springer.com/article/10.1007/s10608-020-10122-3 ; https://pubmed.ncbi.nlm.nih.gov/19719353
- Stone et al. 2006: https://pdodds.w3.uvm.edu/files/papers/others/2006/stone2006a.pdf
- Scheduling: https://m-path.io/blog/predictors-of-response-compliance-in-esm-ema-research-10 ; https://cs.dartmouth.edu/dfk/research/mishra-ema-tr/mishra-ema-tr.pdf ; https://repub.eur.nl/pub/113510/REPUB_113510_OA.pdf
- Kivelä et al. 2022: https://frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2022.876595/full ; Leiden thesis: https://scholarlypublications.universiteitleiden.nl/access/item%3A3677207/view
- Reactivity RCTs: https://pmc.ncbi.nlm.nih.gov/articles/PMC6597111 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC5451128 ; protocol: https://link.springer.com/10.1186/s12888-016-1065-5
- Kauer et al. 2012: https://www.jmir.org/2012/3/e67/
- König et al. 2022: https://eref.uni-bayreuth.de/id/eprint/68937/
- Rumination: https://formative.jmir.org/2022/12/e40045/PDF
- Scott et al. 2020: https://stacks.cdc.gov/view/cdc/217574 ; affect fluctuations: https://pmc.ncbi.nlm.nih.gov/articles/PMC8381239/
- Fisher et al. 2018 PNAS: https://pmc.ncbi.nlm.nih.gov/articles/PMC6142277
- Konjarski et al. 2018: https://doi.org/10.1016/j.smrv.2018.05.005
- Rehder et al. 2026 NHB: https://iro.uiowa.edu/esploro/outputs/journalArticle/An-individual-participant-data-meta-analysis-of/9985163468202771 ; Vuurregge review: https://pure.amsterdamumc.nl/en/publications/within-person-association-between-affect-and-physical-activity-re/
- Deci, Koestner and Ryan 1999: https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf
- Gamification ethics: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11638686/ ; https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11353921/
- Helplines: https://www.aihw.gov.au/suicide-self-harm-monitoring/resources/crisis-helplines-support-services ; https://www.lifeline.org.au/get-help/topics/lifeline-services ; https://www.lifeline.org.au/resources/media-resources/ ; https://www.health.gov.au/ministers/the-hon-emma-mcbride-mp/media/national-head-to-health-phone-service-goes-live
- TGA: https://www.tga.gov.au/resource/examples-regulated-and-unregulated-software-excluded-software-based-medical-devices ; https://www.tga.gov.au/node/599859
- NSQDMH Standards: https://www.safetyandquality.gov.au/national-standards/national-safety-and-quality-digital-mental-health-standards
- Privacy: https://www.safetyandquality.gov.au/sites/default/files/2022-11/action_guide_-_privacy.pdf ; https://accan.org.au/files/Grants/PeaceofMind
