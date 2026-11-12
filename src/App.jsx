import { useMemo, useState } from 'react';
import clinicCsv from '../data/clinic_visits.csv?raw';
import costsCsv from '../data/healthcare_costs.csv?raw';
import heartCsv from '../data/heart_rate_week.csv?raw';
import {
  createSeededRandom,
  estimateFromRows,
  exactSystematicSummary,
  groupOptions,
  mean,
  repeatedSamplingSummary,
  sampleWithoutReplacement,
  shuffleRows,
  stratifiedSampleWithDetails,
  systematicSampleWithDetails,
  trueMean,
} from './sampling';

const datasetTexts = {
  clinic: clinicCsv,
  healthcare: costsCsv,
  heart: heartCsv,
};

const scenarioMeta = {
  clinic: {
    label: 'Clinic waiting times',
    file: 'clinic_visits.csv',
    target: 'wait_time',
    units: 'minutes',
    group: 'visit_type',
  },
  healthcare: {
    label: 'Healthcare costs',
    file: 'healthcare_costs.csv',
    target: 'charges',
    units: 'US dollars',
    group: 'age_band',
  },
  heart: {
    label: 'Wearable heart rate',
    file: 'heart_rate_week.csv',
    target: 'heart_rate_bpm',
    units: 'beats per minute',
    group: 'activity_state',
  },
};

function parseCsv(rawCsv) {
  const lines = rawCsv.replace(/\r/g, '').trim().split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(header.map((field, index) => [field, values[index]]));
  });
}

function sampleForMethod(rows, method, n, seed, groupColumn) {
  const randomFn = createSeededRandom(seed + ':' + method + ':' + n);
  if (method === 'srs') {
    return { rows: sampleWithoutReplacement(rows, n, randomFn) };
  }
  if (method === 'systematic') {
    return systematicSampleWithDetails(rows, n, randomFn);
  }
  if (method === 'stratified') {
    return stratifiedSampleWithDetails(rows, groupColumn, n, randomFn);
  }
  return { rows: [] };
}

function formatValue(value) {
  if (!Number.isFinite(value)) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatWeight(value) {
  return Number(value).toFixed(4);
}

function EstimateDistribution({ title, summary, units, resultType, n }) {
  const width = 420;
  const height = 190;
  const margin = { top: 18, right: 16, bottom: 40, left: 36 };
  const values = summary.estimates;
  const minimum = Math.min(...values, summary.trueMean);
  const maximum = Math.max(...values, summary.trueMean);
  const padding = (maximum - minimum) * 0.06 || 1;
  const low = minimum - padding;
  const high = maximum + padding;
  const binCount = Math.min(24, Math.max(8, Math.ceil(Math.sqrt(values.length))));
  const bins = Array.from({ length: binCount }, () => 0);

  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor(((value - low) / (high - low)) * binCount));
    bins[index] += 1;
  }

  const maxCount = Math.max(...bins, 1);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const meanX = margin.left + ((summary.trueMean - low) / (high - low)) * plotWidth;

  return (
    <figure className="distribution-figure">
      <figcaption>
        <strong>{title}</strong>
        <span>{resultType} · n = {n} · {summary.count.toLocaleString()} {summary.exact ? 'starts' : 'repetitions'}</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} estimate distribution with true mean reference at ${formatValue(summary.trueMean)} ${units}`}>
        <line x1={margin.left} y1={height - margin.bottom} x2={width - margin.right} y2={height - margin.bottom} className="axis-line" />
        {bins.map((count, index) => {
          const barWidth = plotWidth / binCount;
          const barHeight = (count / maxCount) * plotHeight;
          return (
            <rect
              key={index}
              x={margin.left + index * barWidth + 1}
              y={height - margin.bottom - barHeight}
              width={Math.max(1, barWidth - 2)}
              height={barHeight}
              className="distribution-bar"
            >
              <title>{count} estimate(s)</title>
            </rect>
          );
        })}
        <line x1={meanX} y1={margin.top} x2={meanX} y2={height - margin.bottom} className="distribution-true-mean" />
        <text x={margin.left} y={height - 12} className="distribution-tick">{formatValue(low)}</text>
        <text x={width - margin.right} y={height - 12} textAnchor="end" className="distribution-tick">{formatValue(high)}</text>
      </svg>
      <div className="distribution-legend">
        <span><i className="legend-line true-legend-line" /> True mean: {formatValue(summary.trueMean)} {units}</span>
        <span>Estimates: {values.length.toLocaleString()}</span>
      </div>
    </figure>
  );
}

function App() {
  const [scenario, setScenario] = useState('clinic');
  const [method, setMethod] = useState('srs');
  const [sampleSize, setSampleSize] = useState(100);
  const [seed, setSeed] = useState('judge-sample');
  const [repetitions, setRepetitions] = useState(100);
  const [groupColumn, setGroupColumn] = useState(scenarioMeta.clinic.group);
  const [stage4Results, setStage4Results] = useState(null);
  const [challengeShuffleSeed, setChallengeShuffleSeed] = useState('clinic-shuffle');
  const [challengeResults, setChallengeResults] = useState(null);

  const rawRows = useMemo(() => {
    const csvText = datasetTexts[scenario];
    return parseCsv(csvText);
  }, [scenario]);

  const clinicRows = useMemo(() => parseCsv(clinicCsv), []);
  const shuffledClinicRows = useMemo(
    () => shuffleRows(clinicRows, challengeShuffleSeed),
    [clinicRows, challengeShuffleSeed],
  );
  const target = scenarioMeta[scenario].target;
  const groupChoices = useMemo(() => groupOptions(rawRows), [rawRows]);
  const truePopulationMean = useMemo(() => trueMean(rawRows, target), [rawRows, target]);
  const populationValues = useMemo(() => rawRows.map((row) => Number(row[target])), [rawRows, target]);

  const availableGroup = groupChoices.length ? groupChoices[0] : scenarioMeta[scenario].group;
  const activeGroup = groupColumn || availableGroup;

  const groupedPopulation = useMemo(() => {
    const groups = new Map();
    for (const row of rawRows) {
      const key = String(row[activeGroup] ?? 'unknown');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()].map(([label, rows]) => ({ label, count: rows.length }));
  }, [rawRows, activeGroup]);

  const sampleSelection = useMemo(() => {
    if (sampleSize <= 0 || sampleSize > rawRows.length) {
      return { rows: [], error: `Sample size must be from 1 to ${rawRows.length.toLocaleString()}.` };
    }
    if (method === 'stratified' && sampleSize < groupedPopulation.length) {
      return {
        rows: [],
        error: `Stratified sampling needs at least ${groupedPopulation.length} rows so every ${activeGroup} stratum gets at least one.`,
      };
    }
    return sampleForMethod(rawRows, method, sampleSize, seed, activeGroup);
  }, [rawRows, method, sampleSize, seed, activeGroup, groupedPopulation.length]);

  const sampleRows = sampleSelection.rows;
  const sampleEstimate = useMemo(() => {
    if (!sampleRows.length) return null;
    return estimateFromRows(sampleRows, target, method === 'stratified' ? activeGroup : null, rawRows);
  }, [sampleRows, method, target, activeGroup, rawRows]);

  const runStage4 = () => {
    const methods = [
      { label: 'SRS', method: 'srs', n: 100 },
      { label: 'Systematic', method: 'systematic', n: 100 },
      { label: 'Stratified', method: 'stratified', n: 100 },
    ];

    const methodResults = methods.map(({ label, method: methodKey, n }) => {
      let summary;
      if (methodKey === 'systematic' && Number.isInteger(rawRows.length / n)) {
        summary = exactSystematicSummary({ rows: rawRows, target, n, seed });
      } else {
        summary = repeatedSamplingSummary({ rows: rawRows, target, method: methodKey, n, reps: repetitions, seed, groupKey: activeGroup });
      }
      return {
        label,
        method: methodKey,
        n,
        summary,
        resultType: summary.exact ? 'Exact' : 'Monte Carlo',
      };
    });

    const sizeResults = [1, 10, 100].map((n) => {
      const method100 = methodResults.find((entry) => entry.method === 'srs' && entry.n === 100);
      const summary = n === 100
        ? method100.summary
        : repeatedSamplingSummary({ rows: rawRows, target, method: 'srs', n, reps: repetitions, seed });
      return { n, summary, resultType: 'Monte Carlo' };
    });

    setStage4Results({
      scenario: scenarioMeta[scenario].label,
      groupColumn: activeGroup,
      seed,
      repetitions,
      methods: methodResults,
      sizes: sizeResults,
    });
  };

  const runChallenge = () => {
    const n = sampleSize;
    const systematicSummary = (rows, conditionSeed) => {
      if (Number.isInteger(rows.length / n)) {
        return exactSystematicSummary({ rows, target: 'wait_time', n });
      }
      return repeatedSamplingSummary({
        rows,
        target: 'wait_time',
        method: 'systematic',
        n,
        reps: repetitions,
        seed: `${seed}-${conditionSeed}`,
      });
    };
    const stratifiedSummary = (rows, conditionSeed) => repeatedSamplingSummary({
      rows,
      target: 'wait_time',
      method: 'stratified',
      n,
      reps: repetitions,
      seed: `${seed}-${conditionSeed}`,
      groupKey: 'slot',
    });
    const results = [
      {
        condition: 'Baseline · original chronological order',
        method: 'Systematic',
        group: 'File order',
        summary: systematicSummary(clinicRows, 'baseline'),
      },
      {
        condition: 'Modified · deterministically shuffled order',
        method: 'Systematic',
        group: 'File order',
        summary: systematicSummary(shuffledClinicRows, 'shuffled'),
      },
      {
        condition: 'Baseline · original chronological order',
        method: 'Stratified',
        group: 'slot',
        summary: stratifiedSummary(clinicRows, 'baseline'),
      },
      {
        condition: 'Modified · deterministically shuffled order',
        method: 'Stratified',
        group: 'slot',
        summary: stratifiedSummary(shuffledClinicRows, 'shuffled'),
      },
    ].map((result) => ({
      ...result,
      resultType: result.summary.exact ? 'Exact' : 'Monte Carlo',
      resultSeed: result.summary.exact
        ? 'exact'
        : `${seed}-${result.condition.startsWith('Modified') ? 'shuffled' : 'baseline'}`,
    }));

    setChallengeResults({
      n,
      repetitions,
      sampleSeed: seed,
      shuffleSeed: challengeShuffleSeed,
      results,
    });
  };

  const updateScenario = (nextValue) => {
    setScenario(nextValue);
    const meta = scenarioMeta[nextValue];
    setGroupColumn(meta.group);
    setSampleSize(100);
  };

  const chartWidth = 1000;
  const chartHeight = 400;
  const chartMargin = { top: 24, right: 24, bottom: 58, left: 70 };
  const plotWidth = chartWidth - chartMargin.left - chartMargin.right;
  const plotHeight = chartHeight - chartMargin.top - chartMargin.bottom;
  const chartMin = Math.min(0, Math.floor(Math.min(...populationValues) / 10) * 10);
  const chartMax = Math.max(10, Math.ceil(Math.max(...populationValues) / 10) * 10);
  const yPosition = (value) => chartMargin.top + ((chartMax - value) / (chartMax - chartMin)) * plotHeight;
  const xPosition = (index) => chartMargin.left + (index / Math.max(rawRows.length - 1, 1)) * plotWidth;
  const yTicks = Array.from({ length: 6 }, (_, index) => chartMin + ((chartMax - chartMin) * index) / 5);
  const xTicks = Array.from({ length: 5 }, (_, index) => Math.round((rawRows.length - 1) * index / 4));
  const selectedRows = useMemo(() => new Set(sampleRows), [sampleRows]);
  const orderLabel = scenario === 'clinic'
    ? 'Appointment order (visit_id; chronological)'
    : 'Row order in file';
  const targetLabel = `${target} (${scenarioMeta[scenario].units})`;
  const sampleMeanIsAvailable = Number.isFinite(sampleEstimate);

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Judge the Sample</p>
          <h1>Sampling app</h1>
        </div>
      </header>

      <section className="controls-panel card">
        <div className="field-group">
          <label htmlFor="scenario">Scenario</label>
          <select id="scenario" value={scenario} onChange={(event) => updateScenario(event.target.value)}>
            {Object.entries(scenarioMeta).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="method">Method</label>
          <select id="method" value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="srs">Simple random sampling</option>
            <option value="systematic">Systematic sampling</option>
            <option value="stratified">Stratified sampling</option>
          </select>
        </div>

        <div className="field-group">
          <label htmlFor="n">Sample size</label>
          <input id="n" type="number" min="1" max={rawRows.length} value={sampleSize} onChange={(event) => setSampleSize(Math.min(rawRows.length, Math.max(1, Number(event.target.value) || 1)))} />
        </div>

        <div className="field-group">
          <label htmlFor="seed">Seed</label>
          <input id="seed" value={seed} onChange={(event) => setSeed(event.target.value)} />
        </div>

        <div className="field-group">
          <label htmlFor="reps">Repetitions</label>
          <input id="reps" type="number" min="100" max="1000" step="100" value={repetitions} onChange={(event) => setRepetitions(Math.min(1000, Math.max(100, Number(event.target.value) || 100)))} />
        </div>

        <div className="field-group">
          <label htmlFor="group">Stratification column</label>
          <select id="group" value={groupColumn || availableGroup} onChange={(event) => setGroupColumn(event.target.value)}>
            {(groupChoices.length ? groupChoices : [availableGroup]).map((column) => (
              <option key={column} value={column}>{column}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="card method-rule-panel" aria-live="polite">
        <h2>{method === 'srs' ? 'Simple random sampling' : method === 'systematic' ? 'Systematic sampling' : 'Stratified sampling'}: selection rule</h2>
        {sampleSelection.error ? (
          <p className="warning-message" role="status">{sampleSelection.error}</p>
        ) : method === 'srs' ? (
          <p>
            Select {sampleSize} distinct rows at random without replacement, so every set of {sampleSize} rows is equally likely. The estimate is the arithmetic mean of the selected {target} values.
          </p>
        ) : method === 'systematic' ? (
          <>
            <p>
              Follow the file’s row order, choose one random start, then take rows at a fixed interval. The estimate is the sample mean.
            </p>
            <dl className="method-details">
              <div>
                <dt>Interval (N / n)</dt>
                <dd>{formatValue(sampleSelection.interval)} rows</dd>
              </div>
              <div>
                <dt>Design</dt>
                <dd>{sampleSelection.design === 'whole-number' ? 'Whole-number interval' : 'Fractional-interval design'}</dd>
              </div>
              <div>
                <dt>Random start</dt>
                <dd>
                  {sampleSelection.design === 'whole-number'
                    ? `Row ${sampleSelection.start}`
                    : `u = ${Number(sampleSelection.start).toPrecision(5)} (in (0, N / n])`}
                </dd>
              </div>
              <div>
                <dt>First selected row numbers</dt>
                <dd>{sampleRows.slice(0, 5).map((row) => row.visit_id ?? row.row_id ?? rawRows.indexOf(row) + 1).join(', ')}</dd>
              </div>
            </dl>
            <p className="row-order-note">
              {scenario === 'clinic'
                ? 'This file is chronological: visit_id follows weeks, weekdays, and appointment slots. Systematic sampling follows that order. On an unordered list, an interval instead follows file order, not a time sequence.'
                : scenario === 'heart'
                  ? 'This file is ordered by timestamp. Some minutes have no reading, so consecutive row numbers are not necessarily consecutive minutes. Systematic sampling follows file order. On an unordered list, an interval follows file order, not a time sequence.'
                  : 'This file has no documented time order; systematic sampling follows its file order. An interval in an unordered list follows file order, unlike an interval through a chronological record.'}
            </p>
          </>
        ) : (
          <>
            <p>
              Divide the population by <strong>{activeGroup}</strong>, allocate the total sample proportionally using largest-remainder rounding (at least one row per stratum), then select rows at random without replacement within each stratum. The estimate weights each stratum’s sample mean by its share of the full population.
            </p>
            {sampleSelection.strata && (
              <div className="table-scroll">
                <table className="allocation-table">
                  <thead>
                    <tr>
                      <th>{activeGroup} stratum</th>
                      <th>Population N<sub>h</sub></th>
                      <th>Allocation n<sub>h</sub></th>
                      <th>Population weight N<sub>h</sub> / N</th>
                      <th>Sample mean</th>
                      <th>Weighted contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleSelection.strata.map((stratum) => {
                      const stratumMean = mean(stratum.sampleRows.map((row) => Number(row[target])));
                      return (
                        <tr key={stratum.key}>
                          <td>{stratum.key}</td>
                          <td>{stratum.populationCount.toLocaleString()}</td>
                          <td>{stratum.allocation}</td>
                          <td>{formatWeight(stratum.weight)}</td>
                          <td>{formatValue(stratumMean)} {scenarioMeta[scenario].units}</td>
                          <td>{formatValue(stratum.weight * stratumMean)} {scenarioMeta[scenario].units}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {Number.isFinite(sampleEstimate) && (
              <p className="weighted-estimate">
                Population-weighted stratified estimate: <strong>{formatValue(sampleEstimate)} {scenarioMeta[scenario].units}</strong>
              </p>
            )}
          </>
        )}
      </section>

      <section className="metrics-grid">
        <div className="metric card">
          <span className="label">Population</span>
          <strong>{rawRows.length.toLocaleString()} rows</strong>
        </div>
        <div className="metric card">
          <span className="label">True mean</span>
          <strong>{formatValue(truePopulationMean)}</strong>
        </div>
        <div className="metric card">
          <span className="label">Selected sample mean</span>
          <strong>{formatValue(sampleEstimate)}</strong>
        </div>
        <div className="metric card warning">
          <span className="label">Sample size</span>
          <strong>{sampleSize}</strong>
        </div>
      </section>

      <section className="card chart-panel">
        <div className="chart-header">
          <div>
            <h2>{scenario === 'clinic' ? 'Appointments in chronological order' : 'Population rows in file order'}</h2>
            <p>Each dot is one population row; the orange dots are the selected sample.</p>
          </div>
          <span>{rawRows.length.toLocaleString()} population rows</span>
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="dot-plot-svg"
          role="img"
          aria-label={`Dot plot of all ${rawRows.length} rows in file order by ${targetLabel}, with ${sampleRows.length} sampled rows highlighted, the true population mean, and the sample estimate`}
        >
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={chartMargin.left}
                y1={yPosition(tick)}
                x2={chartWidth - chartMargin.right}
                y2={yPosition(tick)}
                className="grid-line"
              />
              <text x={chartMargin.left - 10} y={yPosition(tick) + 4} textAnchor="end" className="axis-tick">
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {xTicks.map((index) => (
            <g key={`x-${index}`}>
              <line
                x1={xPosition(index)}
                y1={chartHeight - chartMargin.bottom}
                x2={xPosition(index)}
                y2={chartHeight - chartMargin.bottom + 5}
                className="axis-line"
              />
              <text
                x={xPosition(index)}
                y={chartHeight - chartMargin.bottom + 22}
                textAnchor="middle"
                className="axis-tick"
              >
                {Number(rawRows[index].visit_id ?? rawRows[index].row_id ?? index + 1).toLocaleString()}
              </text>
            </g>
          ))}
          <line
            x1={chartMargin.left}
            y1={chartHeight - chartMargin.bottom}
            x2={chartWidth - chartMargin.right}
            y2={chartHeight - chartMargin.bottom}
            className="axis-line"
          />
          <line
            x1={chartMargin.left}
            y1={chartMargin.top}
            x2={chartMargin.left}
            y2={chartHeight - chartMargin.bottom}
            className="axis-line"
          />
          {rawRows.map((row, index) => {
            const value = Number(row[target]);
            const isSelected = selectedRows.has(row);
            return (
              <circle
                key={`row-${index}`}
                cx={xPosition(index)}
                cy={yPosition(value)}
                r={isSelected ? 3.8 : 1.5}
                className={isSelected ? 'population-dot sampled-dot' : 'population-dot'}
                aria-label={`${scenario === 'clinic' ? 'Appointment' : 'Row'} ${row.visit_id ?? row.row_id ?? index + 1}: ${formatValue(value)} ${scenarioMeta[scenario].units}${isSelected ? ', selected' : ''}`}
              >
                <title>
                  {`${scenario === 'clinic' ? 'Appointment' : 'Row'} ${row.visit_id ?? row.row_id ?? index + 1}: ${formatValue(value)} ${scenarioMeta[scenario].units}${isSelected ? ' (selected)' : ''}`}
                </title>
              </circle>
            );
          })}
          <line
            x1={chartMargin.left}
            y1={yPosition(truePopulationMean)}
            x2={chartWidth - chartMargin.right}
            y2={yPosition(truePopulationMean)}
            className="mean-line true-mean-line"
          />
          <text
            x={chartWidth - chartMargin.right - 4}
            y={yPosition(truePopulationMean) - 6}
            textAnchor="end"
            className="mean-label true-mean-label"
          >
            True population mean: {formatValue(truePopulationMean)} {scenarioMeta[scenario].units}
          </text>
          {sampleMeanIsAvailable && (
            <>
              <line
                x1={chartMargin.left}
                y1={yPosition(sampleEstimate)}
                x2={chartWidth - chartMargin.right}
                y2={yPosition(sampleEstimate)}
                className="mean-line sample-mean-line"
              />
              <text
                x={chartWidth - chartMargin.right - 4}
                y={yPosition(sampleEstimate) + 16}
                textAnchor="end"
                className="mean-label sample-mean-label"
              >
                Sample estimate: {formatValue(sampleEstimate)} {scenarioMeta[scenario].units}
              </text>
            </>
          )}
          <text
            x={chartMargin.left + plotWidth / 2}
            y={chartHeight - 8}
            textAnchor="middle"
            className="axis-title"
          >
            {orderLabel}
          </text>
          <text
            x={18}
            y={chartMargin.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 18 ${chartMargin.top + plotHeight / 2})`}
            className="axis-title"
          >
            {targetLabel}
          </text>
        </svg>
        <div className="plot-legend" aria-label="Chart legend">
          <span><i className="legend-dot population-legend-dot" /> Population row</span>
          <span><i className="legend-dot sample-legend-dot" /> Selected sample</span>
          <span><i className="legend-line true-legend-line" /> True population mean</span>
          <span><i className="legend-line sample-legend-line" /> Sample estimate</span>
        </div>
        {scenario === 'clinic' && (
          <p className="row-order-note">
            Clinic rows are ordered by appointment time: visit_id runs week by week, Monday through Friday, and slot 1 through 20 each day.
          </p>
        )}
      </section>

      <section className="card detail-grid">
        <div>
          <h3>Selected sample (first 10 rows)</h3>
          {sampleSelection.error && <p className="warning-message" role="status">{sampleSelection.error}</p>}
          <ul className="sample-list">
            {sampleRows.slice(0, 10).map((row, idx) => (
              <li key={`${idx}-${row.visit_id ?? row.row_id ?? row[target]}`}>
                Row {row.visit_id ?? row.row_id ?? idx + 1}: {row[target]} {scenarioMeta[scenario].units}
                {scenario === 'clinic' && ` · Week ${row.week}, ${row.weekday}, slot ${row.slot}`}
              </li>
            ))}
          </ul>
          {sampleRows.length > 10 && <p>… and {sampleRows.length - 10} more rows</p>}
        </div>
        <div>
          <h3>Strata overview</h3>
          <ul className="sample-list">
            {groupedPopulation.map((group) => (
              <li key={group.label}><strong>{group.label}</strong>: {group.count}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card experiment-panel">
        <h2>Stage 4 · Compare methods at n = 100</h2>
        <p>
          One run uses the baseline population, the seed shown below, and the selected repetition count. Whole-number systematic sampling is enumerated exactly. One hundred repetitions often reveal the main pattern; 1,000 can make distributions and summaries more stable. Neither guarantees stability, and small differences may need a new seed to check.
        </p>
        <p className="experiment-settings">
          Population: {scenarioMeta[scenario].label} · Stratification column: {activeGroup} · Seed: <code>{seed}</code> · Monte Carlo repetitions: {repetitions}
        </p>
        <button type="button" className="primary-button" onClick={runStage4}>Run Stage 4 comparisons</button>
        {stage4Results && (
          <>
            <p className="experiment-settings" role="status">
              Current results: baseline {stage4Results.scenario} · seed {stage4Results.seed} · {stage4Results.repetitions} Monte Carlo repetitions · stratified by {stage4Results.groupColumn}. Running again replaces these results.
            </p>
            <div className="distribution-grid">
              {stage4Results.methods.map((result) => (
                <EstimateDistribution
                  key={result.method}
                  title={result.label}
                  summary={result.summary}
                  units={scenarioMeta[scenario].units}
                  resultType={result.resultType}
                  n={result.n}
                />
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Population</th>
                    <th>Method</th>
                    <th>Settings</th>
                    <th>Seed / enumeration</th>
                    <th>n</th>
                    <th>Repetitions / starts</th>
                    <th>Type</th>
                    <th>True mean</th>
                    <th>Mean estimate</th>
                    <th>Bias</th>
                    <th>SD</th>
                    <th>RMSE</th>
                  </tr>
                </thead>
                <tbody>
                  {stage4Results.methods.map((result) => (
                    <tr key={result.method}>
                      <td>Baseline</td>
                      <td>{result.label}</td>
                      <td>{result.method === 'stratified' ? `column: ${stage4Results.groupColumn}` : '—'}</td>
                      <td>{result.summary.exact ? 'exact' : stage4Results.seed}</td>
                      <td>{result.n}</td>
                      <td>{result.summary.count} {result.summary.exact ? 'starts' : 'repetitions'}</td>
                      <td>{result.resultType}</td>
                      <td>{formatValue(result.summary.trueMean)}</td>
                      <td>{formatValue(result.summary.meanEstimate)}</td>
                      <td>{formatValue(result.summary.bias)}</td>
                      <td>{formatValue(result.summary.sd)}</td>
                      <td>{formatValue(result.summary.rmse)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>SRS sample-size comparison</h3>
            <p>Population and method are held fixed; the n = 100 result is reused from the method comparison.</p>
            <div className="distribution-grid">
              {stage4Results.sizes.map((result) => (
                <EstimateDistribution
                  key={result.n}
                  title={`SRS · n = ${result.n}`}
                  summary={result.summary}
                  units={scenarioMeta[scenario].units}
                  resultType={result.resultType}
                  n={result.n}
                />
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Population</th>
                    <th>Method</th>
                    <th>Seed</th>
                    <th>n</th>
                    <th>Repetitions</th>
                    <th>Type</th>
                    <th>True mean</th>
                    <th>Mean estimate</th>
                    <th>Bias</th>
                    <th>SD</th>
                    <th>RMSE</th>
                  </tr>
                </thead>
                <tbody>
                  {stage4Results.sizes.map((result) => (
                    <tr key={result.n}>
                      <td>Baseline</td>
                      <td>Simple random</td>
                      <td>{stage4Results.seed}</td>
                      <td>{result.n}</td>
                      <td>{result.summary.count}</td>
                      <td>{result.resultType}</td>
                      <td>{formatValue(result.summary.trueMean)}</td>
                      <td>{formatValue(result.summary.meanEstimate)}</td>
                      <td>{formatValue(result.summary.bias)}</td>
                      <td>{formatValue(result.summary.sd)}</td>
                      <td>{formatValue(result.summary.rmse)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card experiment-panel">
        <h2>Stage 5 · Test the row-order challenge</h2>
        <p>
          Compare systematic sampling and stratified sampling by appointment slot on the original clinic population and a shuffled copy. The shuffle changes only row order; all appointment rows and wait times remain unchanged. Each condition is evaluated against its own calculated true mean.
        </p>
        <div className="challenge-settings">
          <div className="field-group">
            <label htmlFor="challenge-shuffle-seed">Shuffle seed</label>
            <input id="challenge-shuffle-seed" value={challengeShuffleSeed} onChange={(event) => setChallengeShuffleSeed(event.target.value)} />
          </div>
          <p>Uses the shared sample size n = {sampleSize}, repetitions = {repetitions}, and sampling seed <code>{seed}</code>. Slot-stratified sampling requires n ≥ 20.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={runChallenge}
          disabled={scenario !== 'clinic' || sampleSize < 20 || sampleSize > clinicRows.length}
        >
          Run Stage 5 comparison
        </button>
        {scenario !== 'clinic' && <p className="warning-message">Switch to Clinic waiting times to run this challenge.</p>}
        {sampleSize < 20 && <p className="warning-message">Increase sample size to at least 20 to include every slot stratum.</p>}
        {challengeResults && (
          <>
            <p className="experiment-settings" role="status">
              Current results use n = {challengeResults.n}, {challengeResults.repetitions} Monte Carlo repetitions where applicable, sampling seed <code>{challengeResults.sampleSeed}</code>, and shuffle seed <code>{challengeResults.shuffleSeed}</code>. Running again replaces these results. The shuffled population has the same rows and recalculated true mean as baseline; only their order differs.
            </p>
            <div className="distribution-grid">
              {challengeResults.results.map((result) => (
                <EstimateDistribution
                  key={`${result.condition}-${result.method}`}
                  title={`${result.condition} · ${result.method}${result.group === 'slot' ? ' by slot' : ''}`}
                  summary={result.summary}
                  units="minutes"
                  resultType={result.resultType}
                  n={challengeResults.n}
                />
              ))}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Population / condition</th>
                    <th>Method</th>
                    <th>Settings</th>
                    <th>Seed / enumeration</th>
                    <th>n</th>
                    <th>Repetitions / starts</th>
                    <th>Type</th>
                    <th>True mean (minutes)</th>
                    <th>Mean estimate</th>
                    <th>Bias</th>
                    <th>SD</th>
                    <th>RMSE</th>
                  </tr>
                </thead>
                <tbody>
                  {challengeResults.results.map((result) => (
                    <tr key={`${result.condition}-${result.method}`}>
                      <td>{result.condition}</td>
                      <td>{result.method}</td>
                      <td>{result.group === 'slot' ? 'stratified by slot' : 'systematic in row order'}</td>
                      <td>{result.resultSeed}{result.condition.startsWith('Modified') ? `; shuffle ${challengeResults.shuffleSeed}` : ''}</td>
                      <td>{challengeResults.n}</td>
                      <td>{result.summary.count} {result.summary.exact ? 'starts' : 'repetitions'}</td>
                      <td>{result.resultType}</td>
                      <td>{formatValue(result.summary.trueMean)}</td>
                      <td>{formatValue(result.summary.meanEstimate)}</td>
                      <td>{formatValue(result.summary.bias)}</td>
                      <td>{formatValue(result.summary.sd)}</td>
                      <td>{formatValue(result.summary.rmse)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default App;
