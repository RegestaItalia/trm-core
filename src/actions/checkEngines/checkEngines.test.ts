jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getSoftwareComponents: jest.fn(),
        getInstalledProducts: jest.fn(),
        getNoteStatus: jest.fn(),
        checkTableCondition: jest.fn(),
        getTrmServerPackage: jest.fn()
    }
}));
jest.mock('../../commons/getNodePackage', () => ({
    getNodePackage: jest.fn(() => ({ version: '9.4.0' }))
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { checkEngines, CheckEnginesActionOutput } from '.';

const connector = SystemConnector as unknown as {
    getSoftwareComponents: jest.Mock,
    getInstalledProducts: jest.Mock,
    getNoteStatus: jest.Mock,
    checkTableCondition: jest.Mock,
    getTrmServerPackage: jest.Mock
};

function run(engines: any) {
    return checkEngines({ packageData: { manifest: { name: 'test', version: '1.0.0', engines } } });
}

function result(output: CheckEnginesActionOutput, path: string) {
    return output.results.find(o => o.path === path);
}

describe('checkEngines', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['info', 'log', 'table', 'error', 'loading', 'success'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        connector.getSoftwareComponents.mockResolvedValue([
            { component: 'SAP_BASIS', release: '758', extrelease: '0000000002', compType: 'S' },
            { component: 'SAP_ABA', release: '75I', extrelease: '0000000002', compType: 'S' },
            { component: 'SAP_UI', release: '758', extrelease: '0002', compType: 'S' }
        ]);
        connector.getInstalledProducts.mockResolvedValue([
            { id: '1', name: 'ABAP PLATFORM', version: '2023', vendor: 'sap.com', descript: '', inststatus: '+' },
            { id: '2', name: 'SAP S/4HANA FOUNDATION', version: '2023', vendor: 'sap.com', descript: '', inststatus: '+' }
        ]);
        connector.getNoteStatus.mockImplementation(async (note: string) => ({
            '3284711': { prstatus: 'E', versno: '0003' },
            '1111111': { prstatus: 'O', versno: '0001' },
            '2222222': { prstatus: 'N', versno: '0001' }
        }[note] || {}));
        connector.checkTableCondition.mockResolvedValue(true);
        connector.getTrmServerPackage.mockResolvedValue({ manifest: { get: () => ({ name: 'trm-server', version: '6.4.1' }) } });
    });

    test('trm: trm-core is checked against the version in use, trm-server against the system', async () => {
        const output = await run({ trm: { 'trm-core': '>=9.0.0', 'trm-server': '^6.5.0' } });
        expect(output.passed).toBe(false);
        expect(result(output, 'trm.trm-core')).toMatchObject({ ok: true, actual: 'version 9.4.0', required: true });
        expect(result(output, 'trm.trm-server')).toMatchObject({ ok: false, actual: 'version 6.4.1', requirement: 'version ^6.5.0' });
        expect(connector.getSoftwareComponents).not.toHaveBeenCalled();
    });

    test('trm: the trm-core version supplied by the client takes precedence', async () => {
        const input = (coreVersion: string) => ({ contextData: { coreVersion }, packageData: { manifest: { name: 'test', version: '1.0.0', engines: { trm: { 'trm-core': '>=10.0.0' } } } } });
        expect((await checkEngines(input('10.1.0'))).passed).toBe(true);
        expect((await checkEngines(input('9.9.9'))).passed).toBe(false);
    });

    test('trm: pre-release versions in use satisfy ranges', async () => {
        const output = await checkEngines({ contextData: { coreVersion: '10.0.0-beta.1' }, packageData: { manifest: { name: 'test', version: '1.0.0', engines: { trm: { 'trm-core': '>=9.0.0' } } } } });
        expect(output.passed).toBe(true);
    });

    test('trm: trm-server not installed fails with the reason', async () => {
        connector.getTrmServerPackage.mockRejectedValue(new Error('Package trm-server was not found.'));
        const output = await run({ trm: { 'trm-server': '>=1.0.0' } });
        expect(output.passed).toBe(false);
        expect(result(output, 'trm.trm-server')).toMatchObject({ ok: false, actual: 'not installed', reason: 'Package trm-server was not found.' });
    });

    test('trm: unknown TRM packages are rejected', async () => {
        await expect(run({ trm: { 'trm-client': '>=1.0.0' } })).rejects.toThrow(/unknown TRM package/);
    });

    test('trm: can be used inside anyOf alternatives', async () => {
        const output = await run({ anyOf: [{ trm: { 'trm-server': '>=7.0.0' } }, { trm: { 'trm-core': '>=9.0.0' } }] });
        expect(output.passed).toBe(true);
        expect(result(output, 'anyOf[0].trm.trm-server')).toMatchObject({ ok: false, required: false });
    });

    test('no engines: nothing is read and check passes', async () => {
        const output = await run(undefined);
        expect(output.passed).toBe(true);
        expect(output.results).toEqual([]);
        expect(connector.getSoftwareComponents).not.toHaveBeenCalled();
    });

    test('malformed engines throw', async () => {
        await expect(run({ components: { SAP_BASIS: { release: 'x!' } } })).rejects.toThrow(/Invalid engines declaration/);
    });

    test('components: ranges, installed and not installed', async () => {
        const output = await run({
            components: {
                sap_basis: { release: '>=750', sp: '>=2' },
                SAP_ABA: { release: '>=75H' },
                SAP_UI: true,
                S4CORE: false
            }
        });
        expect(output.passed).toBe(true);
        expect(output.results.every(o => o.ok && o.required)).toBe(true);
        expect(result(output, 'components.SAP_BASIS').actual).toBe('release 758, sp 2');
        expect(connector.getSoftwareComponents).toHaveBeenCalledTimes(1);
    });

    test('components: unmet sp, missing component and forbidden component fail', async () => {
        const output = await run({
            components: {
                SAP_BASIS: { release: '758', sp: '>=3' },
                UI_700: true,
                SAP_UI: false
            }
        });
        expect(output.passed).toBe(false);
        expect(output.results.map(o => o.ok)).toEqual([false, false, false]);
        expect(result(output, 'components.UI_700').actual).toBe('not installed');
    });

    test('components: array constraints are alternatives', async () => {
        const output = await run({ components: { SAP_UI: [{ release: '750', sp: '>=17' }, { release: '>=752' }] } });
        expect(output.passed).toBe(true);
    });

    test('products: version and installed status', async () => {
        const ok = await run({ products: { 'abap platform': { version: '>=2022 <=2023' }, 'SAP S/4HANA FOUNDATION': true, 'SLT': false } });
        expect(ok.passed).toBe(true);
        const ko = await run({ products: { 'ABAP PLATFORM': { version: '>=2025' } } });
        expect(ko.passed).toBe(false);
    });

    test('notes: implemented, obsolete, not implemented, not downloaded and version', async () => {
        const output = await run({
            notes: {
                '0003284711': { version: '>=3' },
                '1111111': true,
                '2222222': true,
                '3333333': true
            }
        });
        expect(connector.getNoteStatus).toHaveBeenCalledWith('3284711');
        expect(output.results.map(o => [o.path, o.ok]).sort()).toEqual([
            ['notes.1111111', true],
            ['notes.2222222', false],
            ['notes.3284711', true],
            ['notes.3333333', false]
        ]);
        const versionKo = await run({ notes: { '3284711': { version: '>=4' } } });
        expect(versionKo.passed).toBe(false);
    });

    test('tables: normalized conditions are passed to the connector, read errors fail', async () => {
        const output = await run({ tables: [{ table: 'seocompodf', where: [{ field: 'clsname', value: '/UI2/CL_JSON' }] }] });
        expect(output.passed).toBe(true);
        expect(connector.checkTableCondition).toHaveBeenCalledWith('SEOCOMPODF', [{ field: 'CLSNAME', op: 'EQ', value: '/UI2/CL_JSON' }]);

        connector.checkTableCondition.mockRejectedValueOnce(new Error('No authorization'));
        const ko = await run({ tables: [{ table: 'SEOCOMPODF', where: [{ field: 'CLSNAME', value: '/UI2/CL_JSON' }] }] });
        expect(ko.passed).toBe(false);
        expect(ko.results[0].reason).toMatch(/No authorization/);
    });

    test('system read errors make requirements fail instead of passing', async () => {
        connector.getSoftwareComponents.mockRejectedValue(new Error('RFC_READ_TABLE not authorized'));
        const output = await run({ components: { S4CORE: false } });
        expect(output.passed).toBe(false);
        expect(output.results[0].reason).toMatch(/not authorized/);
    });

    test('a failed system read is not retried for every requirement', async () => {
        connector.getSoftwareComponents.mockRejectedValue(new Error('RFC_READ_TABLE not authorized'));
        connector.getInstalledProducts.mockRejectedValue(new Error('RFC_READ_TABLE not authorized'));
        const output = await run({ components: { SAP_BASIS: true, SAP_UI: true }, products: { 'ABAP PLATFORM': true, 'S4HANA': true } });
        expect(output.results.map(o => o.ok)).toEqual([false, false, false, false]);
        expect(connector.getSoftwareComponents).toHaveBeenCalledTimes(1);
        expect(connector.getInstalledProducts).toHaveBeenCalledTimes(1);
    });

    test('a blank support package level is level 0', async () => {
        connector.getSoftwareComponents.mockResolvedValue([{ component: 'ZCOMP', release: '100', extrelease: '  ', compType: 'A' }]);
        const output = await run({ components: { ZCOMP: { sp: '>=0' } } });
        expect(result(output, 'components.ZCOMP')).toMatchObject({ ok: true, actual: 'release 100, sp 0' });
        const ko = await run({ components: { ZCOMP: { sp: '>=1' } } });
        expect(result(ko, 'components.ZCOMP')).toMatchObject({ ok: false, actual: 'release 100, sp 0' });
    });

    test('anyOf: passes when one alternative passes, alternatives are not required', async () => {
        const output = await run({
            anyOf: [
                { components: { UI_700: { release: '200', sp: '>=16' } } },
                { components: { SAP_UI: { release: '>=750' } } }
            ]
        });
        expect(output.passed).toBe(true);
        expect(result(output, 'anyOf').required).toBe(true);
        expect(result(output, 'anyOf[0].components.UI_700')).toMatchObject({ ok: false, required: false });
        expect(result(output, 'anyOf[1].components.SAP_UI')).toMatchObject({ ok: true, required: false });

        const ko = await run({ anyOf: [{ components: { UI_700: true } }, { notes: { '2222222': true } }] });
        expect(ko.passed).toBe(false);
        expect(ko.results.filter(o => o.required && !o.ok).map(o => o.path)).toEqual(['anyOf']);
    });

    test('unknown properties inside known engine checks fail (cannot be verified)', async () => {
        const output = await run({
            components: { SAP_BASIS: { release: '>=758', patch: '>=3' } },
            products: { 'ABAP PLATFORM': { version: '>=2023', fps: '>=1' } },
            notes: { '3284711': { version: '>=1', minor: '>=2' } },
            tables: [{ table: 'TADIR', where: [{ field: 'PGMID', value: 'R3TR', client: '100' }], mandt: '100' }]
        });
        expect(output.passed).toBe(false);
        expect(output.results.map(o => [o.path, o.ok, o.reason])).toEqual([
            ['components.SAP_BASIS', false, 'Unsupported property "patch", update TRM to verify it'],
            ['products.ABAP PLATFORM', false, 'Unsupported property "fps", update TRM to verify it'],
            ['notes.3284711', false, 'Unsupported property "minor", update TRM to verify it'],
            ['tables[0]', false, 'Unsupported properties "mandt", "client", update TRM to verify them']
        ]);
        expect(result(output, 'components.SAP_BASIS').requirement).toBe('release >=758, patch >=3');
        expect(connector.getNoteStatus).not.toHaveBeenCalled();
        expect(connector.checkTableCondition).not.toHaveBeenCalled();
    });

    test('an alternative with unknown properties does not match, other alternatives still can', async () => {
        const ok = await run({ components: { SAP_BASIS: [{ release: '758', patch: '>=3' }, { release: '>=750' }] } });
        expect(result(ok, 'components.SAP_BASIS')).toMatchObject({ ok: true, reason: undefined });
        const ko = await run({ components: { SAP_BASIS: [{ release: '758', patch: '>=3' }, { release: '>=800' }] } });
        expect(result(ko, 'components.SAP_BASIS')).toMatchObject({ ok: false, reason: 'Unsupported property "patch", update TRM to verify it' });
    });

    test('unknown engine checks fail (cannot be verified)', async () => {
        const output = await run({ components: { SAP_BASIS: true }, kernel: { release: '>=793' } });
        expect(output.passed).toBe(false);
        expect(result(output, 'kernel').reason).toMatch(/Unsupported engine check "kernel"/);
    });
});
