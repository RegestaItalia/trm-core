import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { TransportImportError } from '../../transport/TransportImportError';
import { buildInstallTelemetry, sendInstallTelemetry } from './telemetry';

const SYSTEM = { basisRelease: '758', basisSp: '0002', product: 'S4HANA', productRelease: '108', dbSystem: 'HDB', kernelRelease: '793' };

function context(overrides: any = {}): any {
    const registry = { telemetry: jest.fn().mockResolvedValue(undefined) };
    return {
        rawInput: {
            contextData: { telemetry: true, coreVersion: '11.3.0' },
            packageData: { name: 'pkg', registry }
        },
        runtime: {
            package: { data: { manifest: { name: 'pkg', version: '1.2.0' } } },
            update: { manifest: { get: () => ({ version: '1.1.0' }) } },
            installRegistry: registry,
            transports: {
                devc: { instance: { trkorr: 'TRMK900001' }, binaries: { entries: { e071: [{ pgmid: 'R3TR', object: 'DEVC', objName: 'ZPKG' }] } } },
                tadir: {
                    instance: { trkorr: 'TRMK900002' },
                    binaries: { entries: { e071: [
                        { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_SECRET_NAME' },
                        { pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OTHER' },
                        { pgmid: 'R3TR', object: 'TABL', objName: 'ZTABLE' }
                    ] } }
                },
                cust: []
            },
            importTelemetry: { startedAt: 0, durationMs: 90000, returnCodes: { TRMK900001: 0, TRMK900002: 4 } }
        },
        ...overrides
    };
}

describe('install telemetry', () => {
    beforeEach(() => {
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        jest.spyOn(SystemConnector, 'getSystemInfo').mockResolvedValue(SYSTEM as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('a successful install reports durations, return codes and object counts, no names', async () => {
        const event = await buildInstallTelemetry(context(), Date.now() - 1000);
        expect(event).toMatchObject({
            schemaVersion: 1,
            event: 'install',
            package: { name: 'pkg', version: '1.2.0', previousVersion: '1.1.0' },
            outcome: 'success',
            importDurationMs: 90000,
            system: SYSTEM,
            client: { core: '11.3.0' },
            transports: [
                { type: 'DEVC', rc: 0, objects: { DEVC: 1 } },
                { type: 'TADIR', rc: 4, objects: { CLAS: 2, TABL: 1 } }
            ]
        });
        expect(event.durationMs).toBeGreaterThanOrEqual(1000);
        expect(event.failure).toBeUndefined();
        expect(JSON.stringify(event)).not.toMatch(/ZCL_SECRET_NAME|ZPKG|TRMK9/);
    });

    test('failures are classified by cause and step', async () => {
        const importError = { stepName: 'import-batch', originalException: new TransportImportError('TRMK900002', 8, 'Import') };
        expect((await buildInstallTelemetry(context(), Date.now(), importError)).failure).toEqual({ reason: 'import', step: 'import-batch', rc: 8 });

        const engines = { stepName: 'check-engines', originalException: new Error('Install aborted') };
        const missingEntries = context();
        missingEntries.runtime.missingSapEntries = 2;
        expect((await buildInstallTelemetry(missingEntries, Date.now(), engines)).failure).toMatchObject({ reason: 'sapEntries', step: 'check-engines' });
        expect((await buildInstallTelemetry(context(), Date.now(), engines)).failure).toMatchObject({ reason: 'engines' });

        const dependencies = { stepName: 'install-dependencies', originalException: { stepName: 'nested', originalException: new Error('x') } };
        expect((await buildInstallTelemetry(context(), Date.now(), dependencies)).failure).toMatchObject({ reason: 'dependencies', step: 'install-dependencies' });

        expect((await buildInstallTelemetry(context(), Date.now(), new Error('boom'))).failure).toEqual({ reason: 'other', step: undefined, rc: undefined });
    });

    test('nothing is built before the release is resolved', async () => {
        expect(await buildInstallTelemetry(context({ runtime: undefined }), Date.now(), new Error('auth'))).toBeUndefined();
    });

    test('is sent to the install registry only when opted in and not simulating', async () => {
        const enabled = context();
        await sendInstallTelemetry(enabled, Date.now());
        expect(enabled.runtime.installRegistry.telemetry).toHaveBeenCalledTimes(1);

        const disabled = context();
        disabled.rawInput.contextData.telemetry = false;
        await sendInstallTelemetry(disabled, Date.now());
        expect(disabled.runtime.installRegistry.telemetry).not.toHaveBeenCalled();

        const simulated = context();
        simulated.rawInput.contextData.simulate = true;
        await sendInstallTelemetry(simulated, Date.now());
        expect(simulated.runtime.installRegistry.telemetry).not.toHaveBeenCalled();
    });

    test('never throws', async () => {
        const failing = context();
        failing.runtime.installRegistry.telemetry.mockRejectedValue(new Error('network'));
        await expect(sendInstallTelemetry(failing, Date.now())).resolves.toBeUndefined();
        (SystemConnector.getSystemInfo as jest.Mock).mockRejectedValue(new Error('no connector'));
        await expect(sendInstallTelemetry(context(), Date.now())).resolves.toBeUndefined();
    });
});
