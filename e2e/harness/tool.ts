/*
 * E2E diagnostics through the trm-core connector (same .env as run.ts).
 * Usage: e2e/harness/tool.sh <command> [args]
 *
 *   log <file>...                  prints tp/R3trans logs from the transport directory, e.g.
 *                                  /usr/sap/trans/log/<SID>I<number>.<SID> (step letters: E export, H dictionary,
 *                                  I main import, A activation, R post-import methods, G generation)
 *   record <package> [registry]    prints the TRM packages table row, install mappings and install transports
 *                                  (registry key: "public", "local" or the endpoint; default "public")
 *   locks                          lists the TRM action locks, grouped by owner token
 *   release-locks <owner token>    releases the action locks of one owner (an interrupted run), like the
 *                                  action itself would: use only when no TRM action of that owner is running
 *
 * One-off checks not covered here: copy this file as a scratch probe outside the repo.
 */
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CORE } = require('./paths');
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: join(CORE, '.env') });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const commons = require('trm-commons');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const core = require(join(CORE, 'src'));

async function connect(): Promise<void> {
    commons.Logger.logger = new commons.DummyLogger();
    // Prompts that are never shown (when: false) are skipped; any other prompt is a usage error.
    commons.Inquirer.inquirer = {
        prompt: async (q: any) => {
            if ([].concat(q).every((o: any) => o.when === false)) return {};
            throw new Error(`Unexpected prompt: ${JSON.stringify(q).slice(0, 200)}`);
        },
        setPrefix() { }, getPrefix() { return ''; }, removePrefix() { }
    };
    const system = new core.RESTSystemConnector({ endpoint: process.env.SAP_URL }, {
        user: process.env.SAP_USER, passwd: process.env.SAP_PASSWORD,
        lang: process.env.SAP_LANGUAGE || 'EN', client: process.env.SAP_CLIENT
    });
    await system.connect();
    core.SystemConnector.systemConnector = system;
}

async function registry(key: string): Promise<any> {
    // Only the registry type matters for the lookups: no file is read.
    if (key === 'local') return new core.FileSystem(join(process.cwd(), 'package.trm'));
    const remote = new core.RegistryV2(key);
    await remote.authenticate({ token: process.env.TRM_PUBLIC_REGISTRY_TOKEN });
    return remote;
}

const commands: Record<string, (args: string[]) => Promise<void>> = {
    async log(files) {
        for (const file of files) {
            try {
                const content: Buffer = await core.SystemConnector.getBinaryFile(file);
                console.log(`===== ${file} (${content.length} bytes)`);
                console.log(content.toString('latin1').replace(/[^\x20-\x7e\n]/g, '.'));
            } catch (e: any) {
                console.log(`===== ${file} ERROR ${e.message}`);
            }
        }
    },
    async record([name, key = 'public']) {
        const reg = await registry(key);
        const row = await core.SystemConnector.getTrmPackageData(name, key);
        console.log(JSON.stringify({
            record: row ? { ...row, manifest: row.manifest.toString() } : null,
            installDevc: await core.SystemConnector.getInstallPackages(name, reg),
            installTransports: await core.SystemConnector.getInstallTransports(name, reg)
        }, null, 2));
    },
    async locks() {
        const rows = await core.SystemConnector.readTable('/ATRM/ACT_LOCK', [
            { fieldName: 'RESOURCE_TYPE' }, { fieldName: 'RESOURCE_NAME' }, { fieldName: 'OWNER_TOKEN' }, { fieldName: 'ACTION_NAME' }
        ]);
        const byOwner: Record<string, any[]> = {};
        rows.forEach((r: any) => (byOwner[r.ownerToken] ||= []).push(`${r.actionName} ${r.resourceType} ${r.resourceName}`));
        console.log(JSON.stringify(byOwner, null, 2));
    },
    async 'release-locks'([owner]) {
        if (!owner) throw new Error('Owner token required (see "locks")');
        const rows = await core.SystemConnector.readTable('/ATRM/ACT_LOCK', [
            { fieldName: 'RESOURCE_TYPE' }, { fieldName: 'RESOURCE_HASH' }, { fieldName: 'RESOURCE_NAME' }, { fieldName: 'OWNER_TOKEN' }
        ], `OWNER_TOKEN EQ '${owner.replace(/'/g, '')}'`);
        const keys = rows.map((r: any) => ({ resourceType: r.resourceType, resourceHash: r.resourceHash, resourceName: r.resourceName }));
        if (keys.length > 0) {
            await core.SystemConnector.releaseActionLocks(keys, owner);
        }
        console.log(`released ${keys.length} lock(s) of ${owner}`);
    }
};

(async () => {
    const [command, ...args] = process.argv.slice(2);
    if (!commands[command]) throw new Error(`Unknown command "${command}": ${Object.keys(commands).join(', ')}`);
    await connect();
    await commands[command](args);
})().catch(e => {
    console.error(`ERROR ${e.message}`);
    process.exit(1);
});
