# Judge the Sample: my sampling app

<!-- If your course asks for a public app, put its link on the next line. Otherwise delete this comment. -->
App link (optional):

**Central question:** Which sampling method would you trust for this population, at what sample size, and with what limits?

- **Scenario:** Clinic waiting times (simulated).
- **Data file:** `data/clinic_visits.csv` (source, licence and provenance in `data/README.md`)
- **Seeds used for my evidence:** `judge-sample` (Stage 4 Monte Carlo); `judge-sample-baseline` and `judge-sample-shuffled` (Stage 5 slot-stratified Monte Carlo); `clinic-shuffle-2026` (Stage 5 row-order shuffle). Exact systematic enumeration uses no seed.

## Run it on your computer

```bash
bash run_app.sh
```

Run it in a Bash terminal (macOS/Linux Terminal, or Git Bash/WSL on Windows) inside this folder.
Open the address it prints. Stop it with Ctrl+C.

## What's here

| File | What it is |
|---|---|
| `AGENT_BRIEF.md` | Instructions and rules for the coding agent. It reads this first. |
| `SETUP.md` | Setup, running, backing up and (optional) publishing. |
| `DECISIONS.md` | My own decisions, results table, findings, challenge hypothesis and interpretation. |
| `data/` | The three populations, data dictionary (`README.md`), `manifest.json` and `datasets.json`. |
| `load_data.mjs` | Minimal loader (`node load_data.mjs data/<file>.csv`): prints the size and columns of a dataset. |
| `evidence/` | Screenshots or exported results for my submission. |

The React + Vite app (`package.json`, `src/`) displays all clinic appointments in chronological order, highlights the selected sample, explains the current sampling rule, and compares the estimate with the labelled population mean. Its systematic panel shows the interval and random start; its stratified panel shows each allocation and population weight. Stage 4 runs reproducible comparisons with estimate-distribution plots and summary tables. Stage 5 compares systematic and slot-stratified sampling on the original and a deterministically shuffled copy without changing the CSV.

Run automated sampling checks with `npm test`; build the app with `npm run build`.
