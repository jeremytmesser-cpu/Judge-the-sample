import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSeededRandom,
  estimateFromRows,
  exactSystematicSummary,
  getStratumDetails,
  largestRemainderAllocation,
  repeatedSamplingSummary,
  sampleWithoutReplacement,
  shuffleRows,
  stratifiedSampleWithDetails,
  systematicSampleWithDetails,
  summarizeEstimates,
  trueMean,
} from './sampling.js';

const population = Array.from({ length: 10_000 }, (_, index) => ({
  id: index + 1,
  value: index,
  group: index < 5475 ? 'Follow-up' : index < 7944 ? 'New' : 'Same-day',
}));

test('simple random samples have the requested distinct rows and are reproducible', () => {
  for (const n of [1, 10, 100, 3333]) {
    const sample = sampleWithoutReplacement(population, n, createSeededRandom(`srs-${n}`));
    const replay = sampleWithoutReplacement(population, n, createSeededRandom(`srs-${n}`));
    assert.equal(sample.length, n);
    assert.equal(new Set(sample).size, n);
    assert.deepEqual(replay, sample);
  }
});

test('systematic samples have exactly n distinct rows for whole and fractional intervals', () => {
  for (const n of [1, 10, 100, 3333]) {
    const sample = systematicSampleWithDetails(population, n, createSeededRandom(`systematic-${n}`));
    const replay = systematicSampleWithDetails(population, n, createSeededRandom(`systematic-${n}`));
    assert.equal(sample.rows.length, n);
    assert.equal(new Set(sample.rows).size, n);
    assert.deepEqual(replay, sample);
  }
});

test('systematic design reports the interval and rows from the random start', () => {
  const rows = population.slice(0, 10);
  const wholeNumber = systematicSampleWithDetails(rows, 5, () => 0);
  assert.equal(wholeNumber.design, 'whole-number');
  assert.equal(wholeNumber.interval, 2);
  assert.equal(wholeNumber.start, 1);
  assert.deepEqual(wholeNumber.rows.map((row) => row.id), [1, 3, 5, 7, 9]);

  const fractional = systematicSampleWithDetails(rows, 3, () => 0.25);
  assert.equal(fractional.design, 'fractional');
  assert.equal(fractional.interval, 10 / 3);
  assert.equal(fractional.rows.length, 3);
  assert.deepEqual(
    fractional.rows.map((row) => row.id),
    [3, 6, 10],
  );
});

test('largest-remainder allocations are whole, total n, and within stratum capacities', () => {
  const counts = { tiny: 1, small: 2, large: 97 };
  for (let n = 3; n <= 100; n += 1) {
    const allocation = largestRemainderAllocation(counts, n);
    assert.equal(Object.values(allocation).reduce((sum, value) => sum + value, 0), n);
    for (const [key, count] of Object.entries(allocation)) {
      assert.ok(Number.isInteger(count));
      assert.ok(count >= 1);
      assert.ok(count <= counts[key]);
    }
  }
  assert.throws(() => largestRemainderAllocation(counts, 2), /number of strata/);
});

test('stratified samples reproduce allocations, contain n unique rows, and have weights summing to one', () => {
  const first = stratifiedSampleWithDetails(population, 'group', 100, createSeededRandom('stratified'));
  const replay = stratifiedSampleWithDetails(population, 'group', 100, createSeededRandom('stratified'));
  assert.equal(first.rows.length, 100);
  assert.equal(new Set(first.rows).size, 100);
  assert.deepEqual(replay, first);
  assert.equal(first.strata.reduce((sum, stratum) => sum + stratum.allocation, 0), 100);
  assert.ok(Math.abs(first.strata.reduce((sum, stratum) => sum + stratum.weight, 0) - 1) < 1e-12);
  for (const stratum of first.strata) {
    assert.equal(stratum.sampleRows.length, stratum.allocation);
    assert.ok(stratum.allocation <= stratum.populationCount);
  }
});

test('stratified estimate uses population weights, not sample proportions', () => {
  const rows = [
    { group: 'A', value: 0 },
    { group: 'A', value: 0 },
    { group: 'A', value: 0 },
    { group: 'B', value: 100 },
    { group: 'B', value: 100 },
    { group: 'B', value: 100 },
    { group: 'B', value: 100 },
    { group: 'B', value: 100 },
    { group: 'B', value: 100 },
    { group: 'B', value: 100 },
  ];
  const sample = [rows[0], rows[3], rows[4]];
  assert.equal(estimateFromRows(sample, 'value', 'group', rows), 70);
  assert.throws(() => estimateFromRows(sample, 'value', 'group'), /Population rows are required/);
});

test('stratified sample size below the number of strata is reported', () => {
  assert.throws(
    () => getStratumDetails(population, 'group', 2),
    /smaller than the number of strata/,
  );
});

test('RMSE squared equals bias squared plus population SD squared', () => {
  const summary = summarizeEstimates([1, 2, 4], 3);
  assert.ok(Math.abs(summary.rmse ** 2 - (summary.bias ** 2 + summary.sd ** 2)) < 1e-12);
  assert.equal(summary.sd, Math.sqrt(14 / 9));
});

test('exact systematic and Monte Carlo summaries use the same SD definition', () => {
  const rows = [
    { value: 1 }, { value: 4 }, { value: 7 }, { value: 2 },
    { value: 5 }, { value: 8 }, { value: 3 }, { value: 6 },
  ];
  const exact = exactSystematicSummary({ rows, target: 'value', n: 2 });
  assert.equal(exact.count, 4);
  assert.ok(Math.abs(exact.rmse ** 2 - (exact.bias ** 2 + exact.sd ** 2)) < 1e-12);

  const monteCarlo = repeatedSamplingSummary({
    rows,
    target: 'value',
    method: 'srs',
    n: 2,
    reps: 20,
    seed: 'summary-check',
  });
  assert.equal(monteCarlo.count, 20);
  assert.ok(Math.abs(monteCarlo.rmse ** 2 - (monteCarlo.bias ** 2 + monteCarlo.sd ** 2)) < 1e-12);
});

test('shuffling is reproducible and preserves the exact population and true mean', () => {
  const original = population.slice(0, 100);
  const shuffled = shuffleRows(original, 'challenge-order');
  const replay = shuffleRows(original, 'challenge-order');
  assert.deepEqual(replay, shuffled);
  assert.notDeepEqual(shuffled, original);
  assert.deepEqual([...shuffled].sort((a, b) => a.id - b.id), original);
  assert.equal(trueMean(shuffled, 'value'), trueMean(original, 'value'));
  assert.deepEqual(original, population.slice(0, 100));
});
