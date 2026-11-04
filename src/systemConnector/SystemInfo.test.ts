import { Logger } from 'trm-commons';
import { SystemConnectorBase } from '.';
import { getSystemInfoFromComponents } from './SystemInfo';

function connector(readTable: jest.Mock, runtime?: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.readTable = readTable;
    if (runtime) {
        instance.getSystemRuntimeInfo = runtime;
    }
    return instance as SystemConnectorBase;
}

const S4 = [
    { component: 'SAP_BASIS', release: '758', extrelease: '0002', compType: 'S' },
    { component: 'SAP_ABA', release: '75I', extrelease: '0002', compType: 'S' },
    { component: 'S4CORE', release: '108', extrelease: '0002', compType: 'R' },
    { component: 'ZCUSTOMER_ADDON', release: '100', extrelease: '0000', compType: 'A' }
];

describe('system info', () => {
    beforeEach(() => {
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('derives SAP_BASIS and product levels from the software components', () => {
        expect(getSystemInfoFromComponents(S4 as any)).toEqual({
            basisRelease: '758', basisSp: '0002', product: 'S4HANA', productRelease: '108', productSp: '0002'
        });
        expect(getSystemInfoFromComponents([
            { component: 'SAP_BASIS', release: '750', extrelease: '0027' },
            { component: 'SAP_APPL', release: '618', extrelease: '0024' }
        ] as any)).toMatchObject({ product: 'ECC', productRelease: '618', productSp: '0024' });
        expect(getSystemInfoFromComponents([{ component: 'SAP_BASIS', release: '757', extrelease: '0001' }] as any))
            .toMatchObject({ product: 'NETWEAVER', productRelease: '757' });
        expect(getSystemInfoFromComponents([])).toEqual({});
    });

    test('is read once and cached, with database and kernel', async () => {
        const readTable = jest.fn().mockResolvedValue(S4);
        const runtime = jest.fn().mockResolvedValue({ dbSystem: 'HDB', kernelRelease: '793' });
        const system = connector(readTable, runtime);
        const first = await system.getSystemInfo();
        const second = await system.getSystemInfo();
        expect(first).toEqual({
            basisRelease: '758', basisSp: '0002', product: 'S4HANA', productRelease: '108', productSp: '0002',
            dbSystem: 'HDB', kernelRelease: '793'
        });
        expect(second).toBe(first);
        expect(readTable).toHaveBeenCalledTimes(1);
        expect(runtime).toHaveBeenCalledTimes(1);
        expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('System info'), true);
    });

    test('passes the missing backend APIs on, and reads again what was skipped', async () => {
        const readTable = jest.fn().mockResolvedValue(S4);
        const runtime = jest.fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ dbSystem: 'HDB', kernelRelease: '793' });
        const system = connector(readTable, runtime);
        expect(await system.getSystemInfo(['trmRest71'])).not.toHaveProperty('dbSystem');
        expect(runtime).toHaveBeenLastCalledWith(['trmRest71']);
        expect(await system.getSystemInfo()).toMatchObject({ dbSystem: 'HDB', kernelRelease: '793' });
        expect(runtime).toHaveBeenLastCalledWith([]);
    });

    test('never throws, and reads again what could not be read', async () => {
        const readTable = jest.fn()
            .mockRejectedValueOnce(new Error('NOT_AUTHORIZED'))
            .mockResolvedValueOnce(S4);
        const system = connector(readTable);
        expect(await system.getSystemInfo()).toEqual({});
        expect(await system.getSystemInfo()).toMatchObject({ basisRelease: '758' });
        await system.getSystemInfo();
        expect(readTable).toHaveBeenCalledTimes(2);
    });
});
