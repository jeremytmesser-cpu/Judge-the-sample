export function createSeededRandom(seed) {
  let hash = 2166136261;
  const text = String(seed ?? 'judge-the-sample');

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;

  return function random() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

export function summarizeEstimates(estimates, trueValue, exact = false) {
  if (!estimates.length) {
    throw new Error('At least one estimate is required to summarize sampling results.');
  }

  const meanEstimate = mean(estimates);
  const variance = estimates.reduce((sum, value) => sum + (value - meanEstimate) ** 2, 0) / estimates.length;
  const sd = Math.sqrt(variance);
  const bias = meanEstimate - trueValue;
  const rmse = Math.sqrt(mean(estimates.map((value) => (value - trueValue) ** 2)));

  return {
    estimates,
    trueMean: trueValue,
    meanEstimate,
    bias,
    sd,
    rmse,
    count: estimates.length,
    ...(exact ? { exact: true } : {}),
  };
}

export function shuffleRows(rows, seed) {
  const shuffled = [...rows];
  const randomFn = createSeededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function sampleMean(rows, target) {
  if (!rows.length) return 0;
  return mean(rows.map((row) => Number(row[target])));
}

export function trueMean(rows, target) {
  return mean(rows.map((row) => Number(row[target])));
}

export function sampleWithoutReplacement(rows, n, randomFn) {
  if (n <= 0 || n > rows.length) return [];

  const indices = [...rows.keys()];
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices.slice(0, n).sort((a, b) => a - b).map((i) => rows[i]);
}

export function systematicSample(rows, n, randomFn) {
  return systematicSampleWithDetails(rows, n, randomFn).rows;
}

export function systematicSampleWithDetails(rows, n, randomFn) {
  const N = rows.length;

  if (n <= 0 || n > N) {
    return {
      rows: [],
      interval: null,
      design: null,
      start: null,
    };
  }

  const quotient = N / n;
  const integerInterval = Number.isInteger(quotient);

  if (integerInterval) {
    const k = quotient;
    const start = Math.max(1, Math.min(k, Math.floor(randomFn() * k) + 1));
    const indices = [];
    for (let i = 0; i < n; i += 1) {
      const index = start - 1 + i * k;
      indices.push(index);
    }
    return {
      rows: indices.map((index) => rows[index]),
      interval: k,
      design: 'whole-number',
      start,
    };
  }

  const interval = quotient;
  const draw = Math.min(1, Math.max(0, randomFn()));
  const start = interval * (1 - draw) || interval;
  const indices = [];

  for (let i = 0; i < n; i += 1) {
    const rowNumber = Math.min(N, Math.max(1, Math.ceil(start + i * interval)));
    indices.push(rowNumber - 1);
  }

  if (new Set(indices).size !== n) {
    throw new Error(`Fractional systematic sampling produced fewer than ${n} distinct rows.`);
  }

  return {
    rows: indices.map((index) => rows[index]),
    interval,
    design: 'fractional',
    start,
  };
}

export function largestRemainderAllocation(counts, total) {
  const entries = Object.entries(counts);
  const populationSize = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!Number.isInteger(total) || total < entries.length || total > populationSize) {
    throw new Error(`Sample size must be between the number of strata (${entries.length}) and population size (${populationSize}).`);
  }

  const order = entries.map(([key, count], index) => ({
    key,
    remainder: (count / populationSize) * total % 1,
    index,
  }));
  const allocation = Object.fromEntries(entries.map(([key, count]) => [
    key,
    Math.min(count, Math.max(1, Math.floor((count / populationSize) * total))),
  ]));
  let assigned = Object.values(allocation).reduce((sum, count) => sum + count, 0);

  while (assigned < total) {
    const candidates = [...order]
      .filter(({ key }) => allocation[key] < counts[key])
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    if (!candidates.length) {
      throw new Error('Unable to allocate the requested sample size across strata.');
    }
    for (const { key } of candidates) {
      if (assigned >= total) break;
      allocation[key] += 1;
      assigned += 1;
    }
  }

  while (assigned > total) {
    const candidates = [...order]
      .filter(({ key }) => allocation[key] > 1)
      .sort((a, b) => a.remainder - b.remainder || b.index - a.index);
    if (!candidates.length) {
      throw new Error('Unable to satisfy the minimum allocation for every stratum.');
    }
    for (const { key } of candidates) {
      if (assigned <= total) break;
      allocation[key] -= 1;
      assigned -= 1;
    }
  }

  return allocation;
}

export function getStratumDetails(rows, groupKey, n) {
  const groups = new Map();

  for (const row of rows) {
    const key = String(row[groupKey]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const stratumCount = groups.size;
  if (n < stratumCount) {
    throw new Error(`Sample size ${n} is smaller than the number of strata (${stratumCount}).`);
  }
  if (n > rows.length) {
    throw new Error(`Sample size ${n} exceeds the population size (${rows.length}).`);
  }

  const counts = Object.fromEntries([...groups.entries()].map(([key, items]) => [key, items.length]));
  const allocation = largestRemainderAllocation(counts, n);

  return [...groups.entries()].map(([key, groupRows]) => ({
    key,
    populationCount: groupRows.length,
    allocation: allocation[key],
    weight: groupRows.length / rows.length,
    rows: groupRows,
  }));
}

export function stratifiedSampleWithDetails(rows, groupKey, n, randomFn) {
  const strata = getStratumDetails(rows, groupKey, n);
  const chosen = [];
  const sampleCounts = {};

  for (const stratum of strata) {
    const sample = sampleWithoutReplacement(stratum.rows, stratum.allocation, randomFn);
    chosen.push(...sample);
    sampleCounts[stratum.key] = sample.length;
  }

  return {
    rows: chosen,
    strata: strata.map(({ key, populationCount, allocation, weight }) => ({
      key,
      populationCount,
      allocation,
      weight,
      sampleRows: chosen.filter((row) => String(row[groupKey]) === key),
    })),
    sampleCounts,
  };
}

export function stratifiedSample(rows, groupKey, n, randomFn) {
  return stratifiedSampleWithDetails(rows, groupKey, n, randomFn).rows;
}

export function estimateFromRows(rows, target, groupKey = null, populationRows = null) {
  if (!rows.length) return 0;
  if (!groupKey) return sampleMean(rows, target);
  if (!populationRows?.length) {
    throw new Error('Population rows are required for a population-weighted stratified estimate.');
  }

  const sampleGroups = new Map();
  for (const row of rows) {
    const key = String(row[groupKey]);
    if (!sampleGroups.has(key)) sampleGroups.set(key, []);
    sampleGroups.get(key).push(row);
  }

  const populationCounts = new Map();
  for (const row of populationRows) {
    const key = String(row[groupKey]);
    populationCounts.set(key, (populationCounts.get(key) ?? 0) + 1);
  }

  return [...populationCounts.entries()].reduce((estimate, [key, count]) => {
    const groupRows = sampleGroups.get(key);
    if (!groupRows?.length) {
      throw new Error(`Stratum "${key}" has no sampled rows for the weighted estimate.`);
    }
    return estimate + (count / populationRows.length) * sampleMean(groupRows, target);
  }, 0);
}

export function repeatedSamplingSummary({ rows, target, method, n, reps, seed, groupKey = null }) {
  const trueValue = trueMean(rows, target);
  const randomFn = createSeededRandom(`${seed}-${method}-${n}-${groupKey ?? ''}`);
  const estimates = [];

  for (let i = 0; i < reps; i += 1) {
    let sample = [];
    if (method === 'srs') {
      sample = sampleWithoutReplacement(rows, n, randomFn);
    } else if (method === 'systematic') {
      sample = systematicSample(rows, n, randomFn);
    } else if (method === 'stratified') {
      sample = stratifiedSample(rows, groupKey, n, randomFn);
    }

    const estimate = method === 'stratified' ? estimateFromRows(sample, target, groupKey, rows) : sampleMean(sample, target);
    estimates.push(estimate);
  }

  return summarizeEstimates(estimates, trueValue);
}

export function exactSystematicSummary({ rows, target, n, seed = 'exact' }) {
  const trueValue = trueMean(rows, target);
  const N = rows.length;
  const k = N / n;

  if (!Number.isInteger(k)) {
    return repeatedSamplingSummary({ rows, target, method: 'systematic', n, reps: 100, seed });
  }

  const estimates = [];
  for (let start = 1; start <= k; start += 1) {
    const sample = [];
    for (let i = 0; i < n; i += 1) {
      const index = start - 1 + i * k;
      if (index < N) sample.push(rows[index]);
    }
    estimates.push(sampleMean(sample, target));
  }

  return summarizeEstimates(estimates, trueValue, true);
}

export function groupOptions(rows) {
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]);
  return keys.filter((key) => {
    const values = new Set(rows.map((row) => String(row[key])));
    return values.size > 1 && values.size <= 20;
  });
}

export function buildDatasetMap(rowsByScenario) {
  const map = {};
  for (const [scenario, rows] of Object.entries(rowsByScenario)) {
    map[scenario] = rows;
  }
  return map;
}
