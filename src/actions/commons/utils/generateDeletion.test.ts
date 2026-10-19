jest.mock('../../../systemConnector', () => ({
    SystemConnector: { getDest: jest.fn(() => 'TST'), deleteTmsTransport: jest.fn() }
}));

jest.mock('../../../transport', () => ({
    Transport: class MockTransport {
        static upload = jest.fn();
    }
}));

import { Logger } from 'trm-commons';
import { RegistryType } from '../../../registry';
import { SystemConnector } from '../../../systemConnector';
import { Transport } from '../../../transport';
import { generateDeletion } from './generateDeletion';

describe('generateDeletion', () => {
    const source = { trkorr: 'TSTK900001', entries: undefined, binaries: { header: Buffer.from('h'), data: Buffer.from('d') } } as any;
    const binaries = { header: Buffer.from('k'), data: Buffer.from('r') };
    const dummy = { trkorr: 'TSTK900002' } as any;
    let uploaded: any;

    function registry(result: any) {
        return { getRegistryType: () => RegistryType.PRIVATE, delete: jest.fn().mockResolvedValue(result) } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'error', 'success'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        uploaded = { trkorr: 'TSTK900002', import: jest.fn().mockResolvedValue(4) };
        (Transport.upload as jest.Mock).mockResolvedValue(uploaded);
    });

    test('sends target, incoming release and exclusions, uploads to the dummy and test-imports it', async () => {
        const reg = registry({ empty: false, binaries, deleted: { e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OLD' }], e071k: [] } });
        const exclude = { e071: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZKEEP' }] };

        await expect(generateDeletion({ registry: reg, source, dummy, subtract: ['TRMK000001'], exclude })).resolves.toBe(uploaded);

        expect(reg.delete).toHaveBeenCalledWith(source.binaries, { target: 'TSTK900002', subtract: ['TRMK000001'], exclude });
        expect(Transport.upload).toHaveBeenCalledWith('TSTK900002', { binary: binaries, trTarget: 'TST' });
        expect(uploaded.import).toHaveBeenCalledWith(true);
        expect(uploaded.import).not.toHaveBeenCalledWith(false);
    });

    test('without dummy, subtraction or exclusions it is the plain deletion of the source', async () => {
        const reg = registry({ empty: false, binaries });
        uploaded.trkorr = 'TSTK900001';

        await generateDeletion({ registry: reg, source, exclude: { e071: [], e071k: [] } });

        expect(reg.delete).toHaveBeenCalledWith(source.binaries, undefined);
        expect(Transport.upload).toHaveBeenCalledWith('TSTK900001', expect.anything());
    });

    test('nothing to delete takes the dummy out of the queue', async () => {
        await expect(generateDeletion({ registry: registry({ empty: true }), source, dummy })).resolves.toBeUndefined();

        expect(SystemConnector.deleteTmsTransport).toHaveBeenCalledWith('TSTK900002', 'TST');
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('a deletion of entries outside the preview is refused before anything is uploaded', async () => {
        const reg = registry({
            empty: false, binaries,
            deleted: { e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OLD' }, { pgmid: 'R3TR', object: 'TABL', objName: 'ZDATA' }], e071k: [] }
        });

        await expect(generateDeletion({
            registry: reg, source, dummy,
            preview: { e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OLD' }], e071k: [] }
        })).rejects.toThrow('nothing was deleted');
        expect(Transport.upload).not.toHaveBeenCalled();
    });

    test('a preview larger than the deletion is accepted, customizing keys compared without client', async () => {
        const reg = registry({
            empty: false, binaries,
            deleted: { e071: [], e071k: [{ table: 'ZCONF', tabkey: '100A' }] }
        });

        await expect(generateDeletion({
            registry: reg, source, dummy,
            preview: { e071: [{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_OLD' }], e071k: [{ table: 'zconf', tabkey: '001A' }] }
        })).resolves.toBe(uploaded);
    });

    test('a failed test import fails the deletion', async () => {
        uploaded.import.mockResolvedValue(8);

        await expect(generateDeletion({ registry: registry({ empty: false, binaries }), source, dummy }))
            .rejects.toThrow('Test import of deletion transport: transport TSTK900002 ended with return code 8');
    });

    test('a backend without trmServer7 skips the test import', async () => {
        await generateDeletion({ registry: registry({ empty: false, binaries }), source, dummy, missingBackendApis: ['trmServer7', 'trmServer8'] });

        expect(uploaded.import).not.toHaveBeenCalled();
    });

    test('a local artifact generates it through the registry it was published to', async () => {
        const real = registry({ empty: true });
        const local = { getRegistryType: () => RegistryType.LOCAL, getRealRegistry: jest.fn().mockResolvedValue(real), delete: jest.fn() } as any;

        await generateDeletion({ registry: local, source });

        expect(local.delete).not.toHaveBeenCalled();
        expect(real.delete).toHaveBeenCalled();
    });
});
