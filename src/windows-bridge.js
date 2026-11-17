import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const runner = fileURLToPath(new URL('../scripts/invoke-indesign.ps1', import.meta.url));

export function buildWrapper(source, resultPath) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('Script must be a non-empty string');
  // eval preserves completion values, including the result of if/else.
  const literal = JSON.stringify(source).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return [
    '(function () {',
    'var resultFile = new File(' + JSON.stringify(resultPath.replace(/\\/g, '/')) + ');',
    'var status = "OK", value;',
    'try {',
    '  value = eval(' + literal + ');',
    '  value = typeof value === "undefined" ? "(no return value)" : String(value);',
    '} catch (e) {',
    '  status = "ERROR";',
    '  value = String(e.message || e) + " (line " + (e.line || "?") + ")";',
    '}',
    'resultFile.encoding = "UTF-8";',
    'resultFile.lineFeed = "Unix";',
    'if (!resultFile.open("w")) throw new Error("Cannot write MCP result: " + resultFile.error);',
    'resultFile.write(status + "\\n" + value);',
    'resultFile.close();',
    '}());',
  ].join('\n');
}

export function parseResult(contents) {
  const text = contents.replace(/^\uFEFF/, '');
  const newline = text.indexOf('\n');
  const status = text.slice(0, newline).trim();
  const value = text.slice(newline + 1);
  if (newline < 0 || !['OK', 'ERROR'].includes(status)) throw new Error('Invalid response from InDesign');
  if (status === 'ERROR') throw new Error('InDesign script failed: ' + value);
  return value;
}

export class WindowsBridge {
  constructor({
    progId = process.env.INDESIGN_PROGID || 'InDesign.Application',
    allowLaunch = process.env.INDESIGN_ALLOW_LAUNCH === '1',
    timeout = Number(process.env.INDESIGN_TIMEOUT_MS || 60000),
    run = execFileAsync,
    platform = process.platform,
  } = {}) {
    if (!/^InDesign\.Application(?:\.\d+)?$/i.test(progId)) throw new Error('Invalid INDESIGN_PROGID');
    if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 600000) throw new Error('Invalid INDESIGN_TIMEOUT_MS (1000–600000)');
    Object.assign(this, { progId, allowLaunch, timeout, run, platform });
    this.queue = Promise.resolve();
    this.timedOut = false;
  }

  execute(source) {
    const job = this.queue.then(() => this.executeOne(source));
    this.queue = job.catch(() => {});
    return job;
  }

  async executeOne(source) {
    if (this.platform !== 'win32') throw new Error('This bridge requires Windows');
    if (this.timedOut) throw new Error('A previous COM call timed out. Check InDesign and restart the MCP server before continuing.');
    buildWrapper(source, 'validate-only');
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'indesign-mcp-'));
    const scriptPath = path.join(temp, 'script.jsx');
    const resultPath = path.join(temp, 'result.txt');
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    try {
      await fs.writeFile(scriptPath, '\uFEFF' + buildWrapper(source, resultPath), 'utf8');
      const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass',
        '-File', runner, '-ScriptPath', scriptPath, '-ProgId', this.progId];
      if (this.allowLaunch) args.push('-AllowLaunch');
      await this.run(powershell, args, {
        windowsHide: true, timeout: this.timeout, maxBuffer: 1024 * 1024, encoding: 'utf8',
      });
      return parseResult(await fs.readFile(resultPath, 'utf8'));
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') {
        this.timedOut = true;
        throw new Error('InDesign COM timed out. The script may still be running inside InDesign; check the app before restarting this MCP server.');
      }
      throw new Error(String(error.stderr || error.message).trim());
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
}
