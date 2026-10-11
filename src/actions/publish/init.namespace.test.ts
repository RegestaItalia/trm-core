jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDevclassObjects: jest.fn(),
        getNamespace: jest.fn(),
        getAbapgitSource: jest.fn()
    }
}));
jest.mock('../../validators', () => ({
    validateDevclass: jest.fn(async () => true)
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { RegistryPackageNotFoundError, RegistryType } from '../../registry';
import { init } from './init';

describe('publish namespace', () => {
    function context(devclass: string) {
        return {
            rawInput: {
                packageData: {
                    name: 'pkg',
                    version: '1.0.0',
                    devclass,
                    manifest: { dependencies: [], postActivities: [], sapEntries: {} },
                    registry: {
                        getRegistryType: () => RegistryType.LOCAL,
                        getPackage: jest.fn(async () => { throw new RegistryPackageNotFoundError('pkg', 'latest', 'local', undefined); }),
                        validatePublish: jest.fn(async () => undefined)
                    }
                },
                contextData: { noInquirer: true, systemPackages: [] },
                publishData: {}
            }
        } as any;
    }

    function objects(...devclasses: string[]) {
        return devclasses.flatMap(devclass => [
            { pgmid: 'R3TR', object: 'DEVC', objName: devclass, devclass },
            { pgmid: 'R3TR', object: 'CLAS', objName: `CL_${devclass.replace(/\//g, '')}`, devclass }
        ]);
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'info', 'warning', 'error', 'success'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ trnspacet: { namespace: '/ACME/' }, trnspacett: [{}] });
        //the step after the namespace read is the abapGit source read: stop there
        (SystemConnector.getAbapgitSource as jest.Mock).mockRejectedValue(new Error('no abapgit'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function runUntilNamespace(ctx: any) {
        await init.run(ctx).catch(e => {
            if (String(e).includes('at most one namespace')) {
                throw e;
            }
        });
    }

    test('reads the namespace of a subpackage when the root uses Z', async () => {
        const ctx = context('ZROOT');
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue(objects('ZROOT', 'YSUB', '/ACME/SUB'));
        await runUntilNamespace(ctx);
        expect(SystemConnector.getNamespace).toHaveBeenCalledWith('/ACME/');
        expect(ctx.runtime.sapPackage.namespace).toBeDefined();
    });

    test('Z and Y packages need no namespace', async () => {
        const ctx = context('ZROOT');
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue(objects('ZROOT', 'YSUB'));
        await runUntilNamespace(ctx);
        expect(SystemConnector.getDevclassObjects).toHaveBeenCalled();
        expect(SystemConnector.getNamespace).not.toHaveBeenCalled();
    });

    test('rejects subpackages in more than one reserved namespace', async () => {
        const ctx = context('/ACME/ROOT');
        (SystemConnector.getDevclassObjects as jest.Mock).mockResolvedValue(objects('/ACME/ROOT', 'ZSUB', '/OTHER/SUB'));
        await expect(init.run(ctx)).rejects.toThrow('SAP packages must use at most one namespace, found: /ACME/, /OTHER/.');
        expect(SystemConnector.getNamespace).not.toHaveBeenCalled();
    });
});
