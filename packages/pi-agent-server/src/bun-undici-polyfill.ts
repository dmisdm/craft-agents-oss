/**
 * Bun compatibility shim — MUST be imported before any undici-dependent module.
 *
 * undici >= 8.0.3 (pulled in transitively via @earendil-works/pi-coding-agent →
 * undici@8.5.0) unconditionally reads `markAsUncloneable` from `node:worker_threads`
 * at module load and calls it while constructing its global `CacheStorage`:
 *
 *   const { markAsUncloneable } = require('node:worker_threads')
 *   webidl.util.markAsUncloneable = markAsUncloneable   // undefined under Bun
 *   ...
 *   webidl.util.markAsUncloneable(this)                 // TypeError
 *
 * Bun's `node:worker_threads` does not export `markAsUncloneable`, so the Pi
 * subprocess crashes on startup with
 * "webidl.util.markAsUncloneable is not a function" (see nodejs/undici#5024).
 * Node 22+ ships the export, which is why the same code works there.
 *
 * We provide a harmless no-op. `markAsUncloneable(obj)` only tags `obj` so that
 * structuredClone refuses to clone it; the Pi agent never clones these objects,
 * so skipping the tag is safe.
 *
 * Imported for its side effect only — keep it as the first import in index.ts so
 * it runs before undici's module initialization.
 */
import { createRequire } from 'node:module';

try {
  const require = createRequire(import.meta.url);
  const workerThreads = require('node:worker_threads') as {
    markAsUncloneable?: (value: unknown) => void;
  };
  if (typeof workerThreads.markAsUncloneable !== 'function') {
    workerThreads.markAsUncloneable = () => {};
  }
} catch {
  // node:worker_threads unavailable or non-writable — nothing we can do; undici
  // will surface its own error if it actually needs the export.
}
