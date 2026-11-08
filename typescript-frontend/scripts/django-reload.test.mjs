import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { pluginDjangoReload } from './django-reload.mjs';

function setup(t, pid = '999999') {
  const previous = process.env.DJANGO_PID;
  process.env.DJANGO_PID = pid;
  t.after(() => {
    if (previous === undefined) delete process.env.DJANGO_PID;
    else process.env.DJANGO_PID = previous;
  });
  const kill = t.mock.method(process, 'kill', () => true);
  t.mock.method(console, 'log', () => {});
  const hooks = {};
  pluginDjangoReload().setup({
    onAfterDevCompile(callback) { hooks.compile = callback; },
    onCloseDevServer(callback) { hooks.close = callback; },
  });
  if (hooks.close) t.after(hooks.close);
  return { hooks, kill };
}

test('invalid PID cannot target a process group', (t) => {
  const { hooks, kill } = setup(t, '-100');
  assert.equal(hooks.compile, undefined);
  assert.equal(kill.mock.callCount(), 0);
});

test('initial and failed builds do not signal Django', async (t) => {
  const { hooks, kill } = setup(t);
  hooks.compile({ isFirstCompile: true, stats: { hasErrors: () => false } });
  hooks.compile({ isFirstCompile: false, stats: { hasErrors: () => true } });
  await delay(150);
  assert.equal(kill.mock.callCount(), 0);
});

test('successful rebuilds debounce to one HUP and server close cancels pending signals', async (t) => {
  const { hooks, kill } = setup(t);
  const rebuild = { isFirstCompile: false, stats: { hasErrors: () => false } };
  hooks.compile(rebuild);
  hooks.compile(rebuild);
  await delay(150);
  assert.equal(kill.mock.callCount(), 1);
  assert.deepEqual(kill.mock.calls[0].arguments, [999999, 'SIGHUP']);
  hooks.compile(rebuild);
  hooks.close();
  await delay(150);
  assert.equal(kill.mock.callCount(), 1);
});

test('an exited Django process does not crash the dev build', async (t) => {
  const { hooks } = setup(t);
  t.mock.method(process, 'kill', () => { throw new Error('ESRCH'); });
  const warn = t.mock.method(console, 'warn', () => {});
  hooks.compile({ isFirstCompile: false, stats: { hasErrors: () => false } });
  await delay(150);
  assert.equal(warn.mock.callCount(), 1);
});
