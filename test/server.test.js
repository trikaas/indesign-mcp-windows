import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InDesignMCPServer } from '../index.js';

test('MCP handshake, schema validation, destructive guard and raw code disabled', async () => {
  let calls = 0;
  const server = new InDesignMCPServer({ bridge: { execute: async () => { calls++; return 'ok'; } } });
  const client = new Client({ name: 'tests', version: '1.0.0' }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const catalog = await client.listTools();
    assert.equal(catalog.tools.length, 51);
    for (const [name, args] of [
      ['create_text_frame', {}],
      ['delete_page', { pageIndex: 0 }],
      ['execute_indesign_code', { code: 'app.version;' }],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, true, name);
    }
    assert.equal(calls, 0);
    const good = await client.callTool({ name: 'get_document_info', arguments: {} });
    assert.equal(good.isError, false);
    assert.equal(calls, 1);
  } finally {
    await client.close();
    await server.server.close();
  }
});

test('text creation and editing generate valid JSX for multiline Windows content', async () => {
  const scripts = [];
  const server = new InDesignMCPServer({ bridge: { execute: async source => {
    new vm.Script(source);
    scripts.push(source);
    return 'ok';
  } } });
  const content = 'ação "com aspas"\nC:\\Users\\teste\rsegunda linha';
  await server.createTextFrame({ content });
  await server.editTextFrame({ frameIndex: 0, content });
  assert.equal(scripts.length, 2);
  await server.server.close();
});

test('Windows paths are normalized and sibling directories are rejected', () => {
  const server = new InDesignMCPServer({ bridge: {} });
  server.allowedDirectories = [process.cwd()];
  const normalized = server.validateFilePath(process.cwd() + '/output/teste.indd');
  assert.ok(!normalized.includes('\\'));
  assert.throws(() => server.validateFilePath(process.cwd() + '-sibling/teste.indd'), /Access denied/);
});
