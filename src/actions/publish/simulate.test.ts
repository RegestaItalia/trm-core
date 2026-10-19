jest.mock('../commons', () => ({
    ...jest.requireActual('../commons'),
    executeWorkflow: jest.fn()
}));

import { Logger } from "trm-commons";
import { executeWorkflow } from "../commons";
import { SystemConnector } from "../../systemConnector";
import { publish } from ".";
import { simulatePublish } from "./simulatePublish";

describe("simulated publish workflow", () => {
    const registry = { endpoint: "registry", name: "public", getRegistryType: () => 1 };

    beforeEach(() => {
        jest.spyOn(SystemConnector, "acquireActionLocks").mockResolvedValue(undefined);
        jest.spyOn(SystemConnector, "releaseActionLocks").mockResolvedValue(undefined);
        (executeWorkflow as jest.Mock).mockReset().mockResolvedValue({ output: { trmPackage: { name: "pkg" }, simulated: true } });
    });

    afterEach(() => jest.restoreAllMocks());

    test("stops after the checks: no transport is created and nothing is published", async () => {
        const result = await publish({ packageData: { name: "pkg", registry }, contextData: { simulate: true } } as any);
        const steps = (executeWorkflow as jest.Mock).mock.calls[0][1].map((step: any) => step.name);
        expect(steps.slice(-2)).toEqual(['lock-resources', 'simulate-publish']);
        expect(steps.some((step: string) => /^generate-|release-transports|publish-to-registry|update-package-data/.test(step))).toBe(false);
        expect(result).toEqual({ trmPackage: { name: "pkg" }, trmArtifact: undefined, simulated: true });
    });

    test("a real publish runs every step", async () => {
        (executeWorkflow as jest.Mock).mockResolvedValue({ output: { trmPackage: { name: "pkg" }, trmArtifact: {} } });
        const result = await publish({ packageData: { name: "pkg", registry } } as any);
        const steps = (executeWorkflow as jest.Mock).mock.calls[0][1].map((step: any) => step.name);
        expect(steps).toContain('publish-to-registry');
        expect(steps).not.toContain('simulate-publish');
        expect(result.simulated).toBeUndefined();
    });
});

describe("simulate-publish", () => {
    afterEach(() => jest.restoreAllMocks());

    test("logs what the publish would do", async () => {
        const info = jest.spyOn(Logger, "info").mockImplementation(() => undefined);
        jest.spyOn(SystemConnector, "getDest").mockReturnValue("DEV");
        const ctx: any = {
            rawInput: {
                systemData: { transportTarget: 'QAS' },
                packageData: { devclass: 'ZROOT', tags: ['beta'], registry: { name: 'public' } },
                publishData: { noLanguageTransport: true, noCustomizingTransports: false }
            },
            runtime: {
                manifest: { name: 'pkg', version: '1.1.0', private: true, dependencies: [{ name: 'dep', version: '^1.0.0' }] },
                sapPackage: { objects: [{}, {}, {}] },
                abapGit: { excludedObjects: [] },
                customizing: { retained: [{ trkorr: 'OLDK1' }], new: [{ trkorr: 'DEVK1' }] }
            },
            output: { trmPackage: {} }
        };
        await simulatePublish.run(ctx);
        const log = info.mock.calls[0][0];
        expect(log).toContain('nothing was changed on DEV or the registry');
        expect(log).toContain('generate and release transports DEVC, TADIR, CUST (DEVK1) to QAS');
        expect(log).toContain('include 3 objects of SAP package ZROOT');
        expect(log).toContain('carry over customizing OLDK1');
        expect(log).toContain('depend on dep ^1.0.0');
        expect(log).toContain('publish private release 1.1.0 to public with tags beta');
        expect(ctx.output.simulated).toBe(true);
    });
});
