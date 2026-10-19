jest.mock('../commons', () => ({
    ...jest.requireActual('../commons'),
    executeWorkflow: jest.fn()
}));
jest.mock('../commons/utils', () => ({
    ...jest.requireActual('../commons/utils'),
    executeRetainedWorkflow: jest.fn(),
    resolveInstallPackage: jest.fn(),
    isLegacyTrmBackend: jest.fn()
}));

import { Logger } from "trm-commons";
import { executeWorkflow } from "../commons";
import { executeRetainedWorkflow, isLegacyTrmBackend, resolveInstallPackage } from "../commons/utils";
import { SystemConnector } from "../../systemConnector";
import { install, installWithRollback } from ".";
import { simulateInstall } from "./simulateInstall";
import { addNamespace } from "./addNamespace";

const MUTATING_STEPS = [
    'generate-devclass', 'prepare-backup', 'prepare-devc', 'prepare-tadir', 'prepare-lang', 'prepare-cust',
    'prepare-deletion', 'import-batch', 'import-update-deletion', 'generate-landscape-transport', 'execute-post-activities',
    'update-package-data', 'release-landscape-transport'
];

function stepNames(mock: jest.Mock): string[] {
    return mock.mock.calls[0][1].map((step: any) => step.name);
}

describe("simulated install workflow", () => {
    const registry = { endpoint: "registry", getRegistryType: () => 2 };

    beforeEach(() => {
        jest.spyOn(SystemConnector, "acquireActionLocks").mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, "releaseActionLocks").mockResolvedValue(undefined);
        (resolveInstallPackage as jest.Mock).mockReset().mockResolvedValue({ name: "pkg", registry });
        (isLegacyTrmBackend as jest.Mock).mockReset().mockResolvedValue(false);
        (executeWorkflow as jest.Mock).mockReset().mockResolvedValue({ output: { manifest: { name: "pkg" }, simulated: true } });
        (executeRetainedWorkflow as jest.Mock).mockReset().mockResolvedValue({ context: { output: { manifest: { name: "pkg" }, simulated: true } }, rollback: jest.fn() });
    });

    afterEach(() => jest.restoreAllMocks());

    test("stops after the cleanup plan and never runs a step that changes the system", async () => {
        const result = await install({ packageData: { name: "pkg", registry }, contextData: { simulate: true } } as any);
        const steps = stepNames(executeWorkflow as jest.Mock);
        expect(steps.slice(-2)).toEqual(['plan-update-cleanup', 'simulate-install']);
        expect(steps).toContain('install-dependencies');
        expect(steps).toContain('add-namespace');
        expect(steps.filter(step => MUTATING_STEPS.includes(step))).toEqual([]);
        expect(result.simulated).toBe(true);
    });

    test("a dependency install is simulated the same way", async () => {
        await installWithRollback({ packageData: { name: "pkg", registry }, contextData: { simulate: true } } as any);
        expect(stepNames(executeRetainedWorkflow as jest.Mock).slice(-1)).toEqual(['simulate-install']);
    });

    test("a real install runs every step", async () => {
        await install({ packageData: { name: "pkg", registry } } as any);
        const steps = stepNames(executeWorkflow as jest.Mock);
        expect(steps).not.toContain('simulate-install');
        expect(steps).toContain('import-batch');
        expect(steps).toContain('generate-devclass');
    });
});

describe("simulate-install", () => {
    let info: jest.SpyInstance;

    beforeEach(() => {
        info = jest.spyOn(Logger, "info").mockImplementation(() => undefined);
        jest.spyOn(SystemConnector, "getDest").mockReturnValue("TST");
        jest.spyOn(SystemConnector, "getDevclass").mockImplementation(async (devclass: string) => devclass === 'ZEXISTING' ? { devclass } as any : undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    function context(): any {
        return {
            rawInput: {
                contextData: { simulate: true },
                installData: {
                    installDevclass: {
                        keepOriginal: false,
                        replacements: [
                            { originalDevclass: 'ZROOT', installDevclass: 'ZNEW' },
                            { originalDevclass: 'ZSUB', installDevclass: 'ZEXISTING' }
                        ]
                    },
                    landscapeTransport: { targetSystem: 'QAS' },
                    skipPostActivities: false
                }
            },
            runtime: {
                namespace: 'Z',
                simulatedNamespace: '/ACME/',
                package: { data: { manifest: { name: 'pkg', version: '2.0.0', postActivities: [{ name: 'ZPA' }] } } },
                transports: {
                    devc: { binaries: { trkorr: 'DEVCK1' } },
                    tadir: { binaries: { trkorr: 'TADIRK1', entries: { tadir: [{}, {}] } } },
                    lang: undefined,
                    cust: [{ binaries: { trkorr: 'CUSTK1' } }]
                },
                skippedCust: ['CUSTK2'],
                cleanupPlan: {
                    packageName: 'pkg',
                    installedVersion: '1.0.0',
                    backupObjects: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZOLD' }, { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_KEPT' }],
                    previewObjects: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZOLD' }],
                    excludeObjects: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_KEPT' }],
                    previewKeys: [{ table: 'ZTAB', tabkey: '001' }],
                    temporaryPackages: []
                }
            }
        };
    }

    test("logs what the install would change and returns the release without importing it", async () => {
        const ctx = context();
        await simulateInstall.run(ctx);
        const log = info.mock.calls[0][0];
        expect(log).toContain('nothing was changed');
        expect(log).toContain('import namespace /ACME/');
        expect(log).toContain('ZROOT -> ZNEW');
        expect(log).not.toContain('generate SAP packages:\n    ZSUB');
        expect(log).toContain('import transports TADIRK1, CUSTK1 (2 objects)');
        expect(log).toContain('skip customizing transports CUSTK2');
        expect(log).toContain('delete 1 objects not shipped anymore:\n    R3TR PROG ZOLD');
        expect(log).toContain('keep 1 objects of the installed release:\n    R3TR CLAS ZCL_KEPT');
        expect(log).toContain('ZTAB 001');
        expect(log).toContain('execute 1 post activities');
        expect(log).toContain('landscape transport to QAS');
        expect(ctx.output).toEqual({ manifest: ctx.runtime.package.data.manifest, simulated: true });
    });
});

describe("add-namespace simulation", () => {
    afterEach(() => jest.restoreAllMocks());

    test("asks for the namespace but doesn't import it", async () => {
        jest.spyOn(SystemConnector, "getNamespace").mockResolvedValue(undefined);
        const add = jest.spyOn(SystemConnector, "addNamespace").mockResolvedValue(undefined);
        jest.spyOn(Logger, "loading").mockImplementation(() => undefined);
        jest.spyOn(Logger, "log").mockImplementation(() => undefined);
        const ctx: any = {
            rawInput: {
                contextData: { simulate: true, noInquirer: true },
                installData: { installDevclass: { keepOriginal: true, replacements: [], skipNamespace: false } }
            },
            runtime: {
                stopWarningShown: false,
                package: {
                    hierarchy: { devclass: '/ACME/ROOT', sub: [] },
                    data: { manifest: { namespace: { replicense: '123', texts: [{ language: 'E', description: 'Acme', owner: 'Acme' }] } } }
                }
            },
            revert: {}
        };
        await addNamespace.run(ctx);
        expect(add).not.toHaveBeenCalled();
        expect(ctx.revert.namespace).toBeUndefined();
        expect(ctx.runtime.simulatedNamespace).toBe('/ACME/');
    });
});
