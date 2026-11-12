# My decisions and evidence notes

Written by me, not by my AI agent. Write my challenge hypothesis (section 5) **before** consulting
my agent about it, and do not edit it afterwards; add a dated revision below instead.

| Stage | What I record here |
|---|---|
| 1 | Section 1 |
| 2–5 | Section 2: my design choice, written before I switch my agent to build |
| 4 | Section 3: method and sample-size rows; section 4: findings (a) and (b) |
| 5 | Section 5: hypothesis first; then section 3: challenge rows; section 5: finding (c) |
| All | Section 6: AI use |

## 1. Population and target

- Scenario and file: Clinic waiting times, `data/clinic_visits.csv`.
- One row means: One appointment, including when it happened in the weekly schedule and how long the patient waited after the appointment time.
- Number of rows (N): 10,000.
- Row order, and what it means in this file: Chronological by `visit_id`, moving week by week from Monday to Friday and slot 1 to 20 within each day. The row order reflects appointment sequence, rather than a random ordering of visits.
- Target column and units: `wait_time`, in minutes.
- My finite population is (and what it is not): The complete set of 10,000 appointment records in this CSV file. It is not a description of every clinic, every week, or every patient in the wider world; it is the data file given for this exercise.
- True mean I calculated (and how): 22.6842 minutes, the mean wait time across all 10,000 rows in the population.

## 2. Design choices

For each stage: the option I chose, why, and what it is meant to help a user learn.

- Stage 2, visualization (include one visual feature meant to reveal a sampling problem): I chose a single-screen population dashboard because it makes the sampling process easy to read at a glance. The app shows the whole finite population, highlights the sampled rows, and places the sample mean beside the true mean so the comparison is immediate. This matters because the main learning goal is not just to generate a sample, but to see where those sampled appointments fall in the sequence and whether they are spread out or clustered.

  The most useful feature is the highlighted sample on the chronological timeline. Seeing the selected visits in context makes it easier to inspect whether a sample is covering the whole appointment pattern or whether it misses certain periods. In a sequence like this, a viewer can immediately ask whether the sample is evenly spread across the day or whether it is concentrated in one part of the schedule. That helps teach the practical meaning of sampling variability and why distribution matters, not just the final estimate.

  I also wanted the app to remain simple and clear. The display does not hide the population behind extra controls or charts, and the labels are obvious: the sample size, the seed, the sample mean, and the true mean are all visible. That makes the app easier for a reader to interpret and helps keep the focus on the method rather than the interface itself.

  I checked the app myself after building it. The population view loads the full 10,000 rows, the selected sample is clearly marked, and the sample size, seed, sample mean, and true mean are all labelled in a way that is easy to read. This gave me confidence that the display was working as intended for the Stage 2 checklist.
- Stage 3, sampling interactions and stratification column: I chose a single control panel with a method selector, sample-size control, and stratification dropdown. This keeps the app simple while making the sampling design easy to compare. The user can switch between simple random sampling, systematic sampling, and stratified sampling, adjust the sample size, and immediately see how the selected rows and estimate update.

  I chose `visit_type` as the stratification column because it is a clinically meaningful grouping for the clinic dataset and matches the way the data is structured: Follow-up, New, and Same-day visits are clearly separated. This makes the stratified method easier to understand and helps show how a sample can be distributed across relevant subgroups instead of being selected as one undifferentiated pool.

  I checked the Stage 3 implementation: the tests passed with 0 failures, and the production build succeeded with only a non-blocking bundle-size warning. In this Windows environment, I started the app with `npm run dev -- --host 0.0.0.0 --port 5173`; Vite moved to port 5174 because port 5173 was already in use, and the served app responded successfully. I confirmed the served app includes the simple random, systematic, and stratified method controls, sample-size and seed controls, and the true-mean label.

- Stage 4, presentation of the method comparison and sample-size experiments: I chose estimate-distribution plots with a true-mean reference while retaining summary tables. Showing the estimate distributions makes their spread and position relative to the true mean visible, while the table gives exact bias, SD, and RMSE values.
- Stage 5, challenge controls and my alternative method or correction: I will compare systematic sampling with stratified sampling by `slot` on both the original clinic row order and a deterministically shuffled copy. The app will keep the rows and wait times unchanged in the modified population, use the same n for all four conditions, and report each condition against its own true mean.

## 3. Results table

One row per result I read from my app. Add rows as needed. Rerun and update a row whenever I
like: my app does not need to keep a history of runs. Seed is "exact" for exact enumeration;
type is Monte Carlo or exact. In Settings I record the settings that matter for the result, such
as the stratification column and allocation, or my challenge-control values. True mean is the
true mean of the population that result was drawn from (the modified copy's own recalculated
value for modified rows). Keep each result in its own row: never pool estimates.

| Experiment | Population or condition | Method | Settings | Seed (or exact) | n | Repetitions or starts | Type | True mean | Bias | SD | RMSE |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Methods at n = 100 | baseline | Simple random | scenario: clinic waiting times | judge-sample | 100 | 100 repetitions | Monte Carlo | 22.68 | 0.00 | 1.34 | 1.34 |
| Methods at n = 100 | baseline | Systematic | scenario: clinic waiting times | exact | 100 | 100 starts | Exact | 22.68 | 0.00 | 6.96 | 6.96 |
| Methods at n = 100 | baseline | Stratified | scenario: clinic waiting times; column: visit_type | judge-sample | 100 | 100 repetitions | Monte Carlo | 22.68 | 0.16 | 1.40 | 1.41 |
| Sample size | baseline | Simple random | scenario: clinic waiting times | judge-sample | 1 | 100 repetitions | Monte Carlo | 22.68 | 0.21 | 14.06 | 14.06 |
| Sample size | baseline | Simple random | scenario: clinic waiting times | judge-sample | 10 | 100 repetitions | Monte Carlo | 22.68 | -0.52 | 3.91 | 3.95 |
| Challenge | baseline · original order | Systematic | scenario: clinic waiting times | exact | 100 | 100 starts | Exact | 22.68 | 0.00 | 6.96 | 6.96 |
| Challenge | modified · shuffled order | Systematic | scenario: clinic waiting times; shuffle seed: `clinic-shuffle-2026` | exact | 100 | 100 starts | Exact | 22.68 | 0.00 | 1.46 | 1.46 |
| Challenge | baseline · original order | Stratified | scenario: clinic waiting times; column: slot | `judge-sample-baseline` | 100 | 100 repetitions | Monte Carlo | 22.68 | 0.08 | 1.17 | 1.17 |
| Challenge | modified · shuffled order | Stratified | scenario: clinic waiting times; column: slot; shuffle seed: `clinic-shuffle-2026` | `judge-sample-shuffled` | 100 | 100 repetitions | Monte Carlo | 22.68 | -0.06 | 1.38 | 1.38 |

The simple random n = 100 row is also the n = 100 sample-size result when the population and
settings match. If I reran it with different settings, I add a separate row. All four challenge
rows use the same n; a challenge baseline row may repeat a matching stage 4 result.

Technical note: the Stage 4 summaries use SD with the number of estimates as the denominator, as
specified in the activity. The Stage 4 rows and findings below were replaced with results rerun
in the corrected app.

## 4. Findings (in my own words, using my own numbers)

- (a) Method comparison: In my n = 100 comparison, SRS had the smallest RMSE (1.34), while SRS also had the smallest SD (1.34). The bias values were 0.00 for SRS, 0.00 for systematic, and 0.16 for stratified. These findings apply to this population, seed, and repetition count; they do not prove the same ranking for every population or run.
- (b) Sample-size finding: For SRS, as n increased from 1 to 100, SD decreased from 14.06 to 1.34 and RMSE decreased from 14.06 to 1.34. In these runs, this suggests that a larger sample cuts random variation, and that systematic sampling can be unbiased on average but still unreliable when the row order has a repeating pattern. These findings apply to this population, seed, and repetition count; they do not prove the same ranking for every population or run.

## 5. Challenge (hypothesis written independently, before consulting my agent)

Hypothesis, written before I consult my agent:

- Date written: November 12, 2026.
- Method I chose to challenge: Systematic sampling with n = 100.
- The change to the population or its ordering: Shuffle the order of the clinic rows while keeping every wait_time value and row membership exactly the same. The true average should therefore remain 22.68 minutes; only the row order changes.
- Why the selection rule would interact with that change: Every week has 100 appointments (5 days with 20 slots each), listed in that order. With n = 100, systematic sampling takes every 100th row, selecting the same weekday and time slot every week. If some slots are consistently busier or slower, the random starting slot can change the estimate substantially. Shuffling the order should remove that alignment with the weekly pattern.
- Evidence I expect across repeated samples: After shuffling, systematic sampling should be about as reliable as simple random sampling, with error around 1.4 to 2.1, and should still be right on average. Simple random sampling should not change much because it does not depend on row order. In the original order, stratifying by time slot should also reduce error. I may additionally try n = 90, so the interval no longer aligns with the 100-row weekly cycle.
- Alternative method or correction I will compare, and why: Stratified sampling by time slot in the original order, as a second check of whether accounting for appointment slot reduces error.
- Evidence that would contradict my hypothesis: If systematic sampling remains very unreliable after shuffling (SD above about 4), the row order may not be the main cause. If stratifying by slot does not help compared with my earlier stratified result (SD 1.51, RMSE 1.53), my explanation may be wrong or incomplete. If simple random sampling changes noticeably after the shuffle, something other than order may be involved.

After I test it:

- Test settings (conditions, methods, alternative method or correction, n, seeds); results are in the table above: Baseline original order and modified shuffled order; systematic and stratified by `slot`; n = 100; 100 repetitions for Monte Carlo; sampling seed `judge-sample` (condition-specific seeds `judge-sample-baseline` and `judge-sample-shuffled` for stratified results); shuffle seed `clinic-shuffle-2026`. Systematic results used exact enumeration of all 100 starts.
- (c) Challenge interpretation: The results support my hypothesis for these tested conditions. Shuffling the row order reduced systematic SD and RMSE from 6.96 to 1.46, about a 79% decrease, within my predicted range, while bias remained zero. The large baseline error was variability across starts, not bias. Stratifying by `slot` in the original order also gave SD and RMSE of 1.17, lower than my earlier stratified-by-`visit_type` result (1.51 / 1.53) and baseline systematic result (6.96). This fits my explanation that the weekly row-order cycle interacted with systematic selection. The shuffled slot-stratified SD/RMSE was slightly higher (1.38 versus 1.17); with different seeds and 100 repetitions, I suspect Monte Carlo variation, but I have not tested that explanation. This is one shuffle seed, and I did not run the optional n = 90 check. I did not test whether SRS changes after shuffling, so that contradicting condition remains untested. These results support the hypothesis for this population, shuffle, and settings; they do not establish that the same pattern holds for other populations or shuffles.

## 6. AI use

- Tools used: GitHub Copilot in VS Code; Node.js/npm and Vite to run tests and build the app; the browser to check the running app.
- What I asked my agent to do, and what I checked myself: I used the AI assistant to restore the starter, build and update the browser-based sampling app, correct the sampling calculations, and verify the software. I chose the visual design, interaction, stratification columns, Stage 4 presentation, and challenge hypothesis. I ran the sampling investigations, checked the app and its displayed controls, and supplied and reviewed my interpretations and written findings. The AI assistant helped format my notes and evidence table.
- Automated checks my agent reported (I did not let it interpret my results): 10 automated sampling tests passed, including sample sizes and distinct rows, reproducible seeds, systematic start/interval rules, stratified allocation limits and totals, population weights and weighted estimator known-answer check, RMSE² = bias² + SD², and reproducible shuffling with an unchanged true mean. The Vite production build succeeded with a non-blocking bundle-size warning; browser checks confirmed the experiment controls and settings were visible.
