import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const source = transpileModule(
  readFileSync(new URL('../src/gold-lighting.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } },
).outputText;

function setup({ reduced = false, fine = true, webgl = null, throws = false } = {}) {
  function events() {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    };
  }
  const canvases = [];
  const observers = [];
  const requests = [];
  const classes = new Set();
  const frame = {
    prepend() {},
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
  };
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const window = { ...events(), IntersectionObserver: Observer, ResizeObserver: Observer };
  const motion = { ...events(), matches: reduced };
  const pointer = { ...events(), matches: fine };
  const exports = {};
  runInNewContext(source, {
    exports, window,
    require: path => ({ __esModule: true, default: path }),
    IntersectionObserver: Observer, ResizeObserver: Observer,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    matchMedia: query => query.includes('reduced-motion') ? motion : pointer,
    document: {
      ...events(), hidden: false, documentElement: events(),
      querySelector: () => frame,
      createElement() {
        const canvas = {
          ...events(),
          setAttribute() {},
          getContext() {
            if (throws) throw new Error('WebGL disabled');
            return webgl;
          },
          remove() { this.removed = true; },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
    Image: class {
      set src(url) {
        requests.push(url);
        queueMicrotask(() => url.endsWith('.png') ? this.onerror() : this.onload());
      }
    },
  });
  exports.initGoldLighting();
  return { canvases, observers, requests, classes, window, motion, pointer };
}

test('reduced-motion and coarse pointers retain the image without loading textures', () => {
  for (const options of [{ reduced: true }, { fine: false }]) {
    const state = setup(options);
    assert.equal(state.canvases.length, 0);
    assert.deepEqual(state.requests, []);
    assert.equal(state.classes.has('has-live-gold'), false);
  }
});

test('unavailable or blocked WebGL leaves the static image in place', () => {
  for (const options of [{}, { throws: true }]) {
    const state = setup(options);
    assert.equal(state.canvases[0].removed, true);
    assert.equal(state.classes.has('has-live-gold'), false);
    assert.deepEqual(state.requests, []);
  }
});

test('a missing normal map falls back and removes observers and interaction listeners', async () => {
  const state = setup({ webgl: { getExtension: () => null } });
  assert.deepEqual(state.requests, [], 'Offscreen textures should not be requested');
  state.observers[0].callback([{ isIntersecting: true }]);
  await setImmediate();
  assert.equal(state.requests.length, 2);
  assert.equal(state.canvases[0].removed, true);
  assert.equal(state.classes.has('has-live-gold'), false);
  assert(state.observers.every(observer => observer.disconnected));
  assert.equal(state.window.listeners.get('pointermove').size, 0);
});
