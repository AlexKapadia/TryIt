/**
 * measure_pipeline_latency.mjs — MEASURED latency sampler for the evidence showcase.
 *
 * Drives the REAL built TypeScript (packages/cache + packages/engine dist) to time the two
 * hot, deterministic, network-free operations on the try-on critical path:
 *   1. cache-key derivation  (hashImageBytes + deriveCacheKey) — runs on every request.
 *   2. the deterministic provider tryOn — the engine's guaranteed offline fallback.
 *
 * Emits newline-delimited JSON timing samples (microseconds) to stdout for the Python
 * benchmark to aggregate and plot. No network, no randomness in the measured code — only the
 * wall clock varies. Warm-up iterations exclude JIT/first-call cost so the distribution
 * reflects steady-state latency.
 *
 * Usage:  node evidence/scripts/measure_pipeline_latency.mjs [samples]
 */
import { performance } from 'node:perf_hooks';
import { deriveCacheKey, hashImageBytes } from '../../packages/cache/dist/cache-key.js';
import { DeterministicProvider } from '../../packages/engine/dist/providers/deterministic.js';

const SAMPLES = Number.parseInt(process.argv[2] ?? '20000', 10);
const WARMUP = 2000;

const provider = new DeterministicProvider();
const ctx = {
  timeoutMs: 1000,
  signal: new AbortController().signal,
  logger: { debug() {}, warn() {}, error() {} },
};

// A realistic ~50KB person image payload (deterministic content, hashed every request).
const imageBytes = new Uint8Array(50 * 1024);
for (let i = 0; i < imageBytes.length; i += 1) imageBytes[i] = (i * 31 + 7) & 0xff;

function makeRequest(i) {
  return {
    tenantId: `tenant-${i % 8}`,
    shopperId: `shopper-${i % 500}`,
    productId: `sku-${i % 200}`,
    personImage: { kind: 'base64', data: 'QUJD' },
    params: { size: 'M', fit: 'regular', view: 'front' },
  };
}

async function timeCacheKey(i) {
  const t0 = performance.now();
  const hash = hashImageBytes(imageBytes);
  deriveCacheKey({
    tenantId: `tenant-${i % 8}`,
    personImageHash: hash,
    productId: `sku-${i % 200}`,
    params: { size: 'M', fit: 'regular', view: 'front' },
  });
  return (performance.now() - t0) * 1000; // -> microseconds
}

async function timeProvider(i) {
  const req = makeRequest(i);
  const t0 = performance.now();
  await provider.tryOn(req, ctx);
  return (performance.now() - t0) * 1000; // -> microseconds
}

async function run() {
  // Warm up both paths so the reported distribution is steady-state, not first-call JIT.
  for (let i = 0; i < WARMUP; i += 1) {
    await timeCacheKey(i);
    await timeProvider(i);
  }
  const out = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    out.push(JSON.stringify({ op: 'cache_key', us: await timeCacheKey(i) }));
    out.push(JSON.stringify({ op: 'deterministic_provider', us: await timeProvider(i) }));
    if (out.length >= 4000) {
      process.stdout.write(out.join('\n') + '\n');
      out.length = 0;
    }
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  process.stderr.write(`measured ${SAMPLES} samples/op (warmup ${WARMUP})\n`);
}

run().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + '\n');
  process.exit(1);
});
