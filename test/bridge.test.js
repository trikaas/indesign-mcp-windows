import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildWrapper, parseResult, WindowsBridge } from '../src/windows-bridge.js';

function simulate(source) {
  let contents = '';
  const context = { File: function () {
    return { open: () => true, write: value => { contents += value; }, close() {} };
  } };
  vm.runInNewContext(buildWrapper(source, 'C:\\teste com espaço\\ação.txt'), context);
  return parseResult(contents);
}

test('captures the evaluated branch and preserves Unicode, quotes and backslashes', () => {
  assert.equal(simulate('if (true) { "ação\\nC:\\\\teste \\"ok\\""; } else { "wrong"; }'), 'ação\nC:\\teste "ok"');
  assert.equal(simulate('var total = 2; total + 3;'), '5');
  assert.equal(simulate('var value = 2;'), '(no return value)');
});

test('script errors are failures rather than successful text', () => {
  assert.throws(() => simulate('throw new Error("Falha de teste");'), /Falha de teste/);
  assert.throws(() => parseResult('broken'), /Invalid response/);
  assert.equal(parseResult('\uFEFFOK\naccent: ação'), 'accent: ação');
});

test('serializes COM calls, uses isolated files, and cleans them up', async () => {
  let running = 0, maximum = 0;
  const seen = [];
  const bridge = new WindowsBridge({ platform: 'win32', run: async (command, args, options) => {
    running++;
    maximum = Math.max(maximum, running);
    const file = args[args.indexOf('-ScriptPath') + 1];
    seen.push(file);
    assert.ok(command.endsWith('powershell.exe'));
    assert.equal(options.windowsHide, true);
    assert.ok(args.includes('-STA'));
    await new Promise(resolve => setTimeout(resolve, 15));
    await fs.writeFile(path.join(path.dirname(file), 'result.txt'), 'OK\nação');
    running--;
  } });
  assert.deepEqual(await Promise.all([bridge.execute('"first"'), bridge.execute('"second"')]), ['ação', 'ação']);
  assert.equal(maximum, 1);
  assert.notEqual(seen[0], seen[1]);
  for (const file of seen) await assert.rejects(fs.access(file));
});

test('blocks queued execution after a timeout, while ordinary failures can recover', async () => {
  let calls = 0;
  const bridge = new WindowsBridge({ platform: 'win32', run: async () => {
    calls++;
    throw Object.assign(new Error('timeout'), { killed: true });
  } });
  await assert.rejects(bridge.execute('"first"'), /may still be running/);
  await assert.rejects(bridge.execute('"second"'), /previous COM call timed out/);
  assert.equal(calls, 1);
});
