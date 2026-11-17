import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WindowsBridge } from '../src/windows-bridge.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'output', 'smoke-' + Date.now());
await fs.mkdir(output, { recursive: true });
const bridge = new WindowsBridge();
const client = new Client({ name: 'windows-smoke', version: '0.1.0' }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'index.js')],
  env: { ...process.env },
});
let createdId;
const steps = [];
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content.map(item => item.text || '').join('\n');
  if (result.isError) throw new Error(name + ': ' + text);
  steps.push({ tool: name, result: text });
  console.log(text);
  return text;
}
try {
  await client.connect(transport);
  const catalog = await client.listTools();
  assert.equal(catalog.tools.length, 51);
  console.log('MCP connected; tools: ' + catalog.tools.length);
  const previousIds = (await bridge.execute('var ids = []; for (var i=0; i<app.documents.length; i++) ids.push(app.documents[i].id); ids.join(",");')).split(',').filter(Boolean);
  await call('create_document', { preset: 'A4', pages: 1, facingPages: false });
  createdId = Number(await bridge.execute('app.activeDocument.id;'));
  assert.ok(!previousIds.includes(String(createdId)), 'Smoke must only modify its own new document');
  await call('create_text_frame', {
    content: 'Teste de conexão Codex + InDesign\nAção, criação, edição — Windows.',
    x: 20, y: 30, width: 170, height: 50, fontFamily: 'Arial', fontSize: 20,
  });
  await call('get_document_info');
  const text = await call('get_text_content', { frameIndex: 0, pageIndex: 0 });
  assert.ok(text.includes('Ação, criação, edição'));
  await call('save_document', { filePath: path.join(output, 'teste-windows.indd'), confirmDestructive: true });
  const exported = await call('export_pdf', { filePath: path.join(output, 'teste-windows.pdf'), confirmDestructive: true });
  assert.ok(exported.includes('PDF exported successfully'));
  for (const file of ['teste-windows.indd', 'teste-windows.pdf']) {
    assert.ok((await fs.stat(path.join(output, file))).size > 100);
  }
  const pdfHeader = (await fs.readFile(path.join(output, 'teste-windows.pdf'))).subarray(0, 5).toString();
  assert.equal(pdfHeader, '%PDF-');
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ version: await bridge.execute('app.version;'), steps }, null, 2));
  console.log('Smoke passed. Artifacts: ' + output);
} finally {
  if (createdId) {
    await bridge.execute('var testDoc = app.documents.itemByID(' + createdId + '); if (testDoc.isValid) testDoc.close(SaveOptions.NO);');
  }
  await client.close();
}
