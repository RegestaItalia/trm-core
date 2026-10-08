/*
 * E2E runner: executes one trm-core action from `src/` against the system and registry in `.env`.
 * Every prompt goes through a file-based inquirer (see HARNESS.md), so the operator answers it
 * like on the CLI. Usage (normally through go.sh): ts-node run.ts <spec.json>
 *
 * Spec: { label, action, input, file? }
 *   - action: name of an action exported by trm-core (install, publish, deletePackage, ...)
 *   - input:  the action input; packageData.registry and contextData.logTemporaryFolder are set here
 *   - file:   path of a .trm file, to use the FileSystem registry instead of the remote one
 *
 * Each run writes, under <work>/logs/<label>/: spec.json, transcript.log (prompts and answers),
 * output.json (action output), result.json (status, seconds, error) and the trm-core log files.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CORE, IPC, LOGS } = require('./paths');
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: join(CORE, '.env') });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const commons = require('trm-commons');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require(join(CORE, 'src'));

const TRANSCRIPT = join(IPC, 'transcript.log');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Prompt data without functions, so it can be written as JSON. */
function plain(v: any): any {
    if (v === undefined || v === null) return v;
    if (typeof v === 'function') return '[function]';
    if (Array.isArray(v)) return v.map(plain);
    if (typeof v === 'object') {
        const o: any = {};
        for (const k of Object.keys(v)) {
            if (k === 'valueHelp' || k === 'validate') continue;
            o[k] = plain(v[k]);
        }
        return o;
    }
    return v;
}

/**
 * Writes each question to <ipc>/q-<n>.json and waits for <ipc>/a-<n>.json:
 * `{ "value": <answer> }` or `{ "useDefault": true }`. Validation errors are asked again.
 */
class FileInquirer {
    private prefix = '';
    private n = 0;
    async prompt(arg: any): Promise<any> {
        const questions = Array.isArray(arg) ? arg : [arg];
        const hash: any = {};
        for (const q of questions) {
            let ask = true;
            if (q.when !== undefined) ask = typeof q.when === 'boolean' ? q.when : await q.when(hash);
            if (!ask) continue;
            let choices = q.choices;
            if (!choices && q.source) {
                try { choices = await q.source(''); } catch (e) { choices = [`<source error ${e}>`]; }
            }
            let def = q.default;
            if (typeof def === 'function') { try { def = await def(hash); } catch { def = '[function]'; } }
            let error: string | undefined;
            while (true) {
                const id = ++this.n;
                const aFile = join(IPC, `a-${id}.json`);
                writeFileSync(join(IPC, `q-${id}.json`), JSON.stringify({
                    id, type: q.type, name: q.name, message: this.prefix + q.message, default: plain(def),
                    choices: plain(choices), ui: plain(q.ui), error
                }, null, 2));
                appendFileSync(TRANSCRIPT, `\n[Q${id}] (${q.type}) ${q.name}: ${this.prefix}${q.message}${error ? ` [validation error: ${error}]` : ''}`);
                process.stdout.write(`\n@@QUESTION ${id}\n`);
                while (!existsSync(aFile)) await sleep(500);
                await sleep(100);
                const raw = JSON.parse(readFileSync(aFile, 'utf8'));
                const value = raw.useDefault ? def : raw.value;
                appendFileSync(TRANSCRIPT, `\n[A${id}] ${JSON.stringify(value)}`);
                if (q.validate) {
                    const res = await q.validate(value, hash);
                    if (res !== true && res !== undefined) {
                        error = typeof res === 'string' ? res : JSON.stringify(res);
                        continue;
                    }
                }
                hash[q.name] = value;
                break;
            }
        }
        return hash;
    }
    setPrefix(t: string) { this.prefix = t; }
    removePrefix() { this.prefix = ''; }
    getPrefix() { return this.prefix; }
    isUi() { return false; }
}

/** Action output as JSON: binaries and circular references are replaced. */
function serializable(out: any): any {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(out, (k, v) => {
        if (v instanceof Buffer || k === 'binaries' || k === '_binaries') return '[binary]';
        if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[circular]';
            seen.add(v);
        }
        return v;
    }) || '{}');
}

async function main() {
    const specFile = process.argv[2];
    const spec = JSON.parse(readFileSync(specFile, 'utf8'));
    const logDir = join(LOGS, spec.label || 'run');
    mkdirSync(logDir, { recursive: true });
    mkdirSync(IPC, { recursive: true });
    copyFileSync(specFile, join(logDir, 'spec.json'));
    writeFileSync(TRANSCRIPT, '');

    commons.Logger.logger = new commons.CliLogFileLogger(logDir, true);
    commons.Inquirer.inquirer = new FileInquirer();

    // The remote registry endpoint comes from TRM_PUBLIC_REGISTRY_ENDPOINT, the token from TRM_PUBLIC_REGISTRY_TOKEN.
    const remoteRegistry = new core.RegistryV2('public');
    await remoteRegistry.authenticate({ token: process.env.TRM_PUBLIC_REGISTRY_TOKEN });
    core.RegistryProvider.registry = [remoteRegistry];
    const registry = spec.file ? new core.FileSystem(spec.file) : remoteRegistry;

    const system = new core.RESTSystemConnector({ endpoint: process.env.SAP_URL }, {
        user: process.env.SAP_USER, passwd: process.env.SAP_PASSWORD,
        lang: process.env.SAP_LANGUAGE || 'EN', client: process.env.SAP_CLIENT
    });
    await system.connect();
    core.SystemConnector.systemConnector = system;

    const input = spec.input || {};
    input.packageData = { ...(input.packageData || {}), registry };
    input.contextData = { ...(input.contextData || {}), logTemporaryFolder: join(logDir, 'tmp') };
    const action = core[spec.action];
    if (typeof action !== 'function') throw new Error(`Unknown action ${spec.action}`);

    const started = Date.now();
    const result: any = { label: spec.label, action: spec.action };
    try {
        const out = await action(input);
        writeFileSync(join(logDir, 'output.json'), JSON.stringify(serializable(out), null, 2));
        result.status = 'OK';
    } catch (e: any) {
        result.status = 'FAIL';
        result.error = { name: e?.name, message: e?.message, cause: e?.cause?.message || e?.cause };
        process.stdout.write(`\n${e?.stack}\n`);
        process.exitCode = 1;
    } finally {
        result.seconds = Math.round((Date.now() - started) / 1000);
        writeFileSync(join(logDir, 'result.json'), JSON.stringify(result, null, 2));
        copyFileSync(TRANSCRIPT, join(logDir, 'transcript.log'));
        try { commons.Logger.logger.endLog?.(); } catch { /* best effort */ }
        process.stdout.write(`\n@@DONE ${result.status} ${result.seconds}s${result.error ? ` ${result.error.name}: ${result.error.message}` : ''}\n`);
        writeFileSync(join(IPC, 'done'), '1');
    }
}

main().catch(e => {
    process.stdout.write(`\n@@DONE CRASH ${e?.stack || e}\n`);
    mkdirSync(IPC, { recursive: true });
    writeFileSync(join(IPC, 'done'), '1');
    process.exit(1);
});
