jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getNamespace: jest.fn(),
        addNamespace: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { addNamespace } from './addNamespace';

describe('add-namespace target namespace', () => {
    function context(replacements: { originalDevclass: string, installDevclass: string }[], keepOriginal = false) {
        return {
            rawInput: {
                contextData: { noInquirer: true },
                installData: {
                    installDevclass: { keepOriginal, replacements }
                }
            },
            runtime: {
                stopWarningShown: true,
                package: {
                    hierarchy: { devclass: 'ZROOT', sub: [{ devclass: 'ZSUB', sub: [] }] },
                    data: { manifest: {} }
                }
            },
            revert: {}
        } as any;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue({ trnspacet: {} });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('uses the root replacement even when a subpackage is listed first', async () => {
        const ctx = context([
            { originalDevclass: 'ZSUB', installDevclass: 'ZSUB' },
            { originalDevclass: 'ZROOT', installDevclass: '/ACME/FOO' }
        ]);
        await addNamespace.run(ctx);
        expect(ctx.runtime.namespace).toBe('/ACME/');
        expect(SystemConnector.getNamespace).toHaveBeenCalledWith('/ACME/');
    });

    test('checks a reserved namespace used only by a subpackage', async () => {
        const ctx = context([
            { originalDevclass: 'ZROOT', installDevclass: 'ZFOO' },
            { originalDevclass: 'ZSUB', installDevclass: '/ACME/SUB' }
        ]);
        await addNamespace.run(ctx);
        expect(ctx.runtime.namespace).toBe('/ACME/');
        expect(SystemConnector.getNamespace).toHaveBeenCalledWith('/ACME/');
    });

    test('customer namespaces need no namespace check', async () => {
        const ctx = context([
            { originalDevclass: 'ZROOT', installDevclass: 'ZFOO' },
            { originalDevclass: 'ZSUB', installDevclass: 'YSUB' }
        ]);
        await addNamespace.run(ctx);
        expect(ctx.runtime.namespace).toBe('Z');
        expect(SystemConnector.getNamespace).not.toHaveBeenCalled();
    });

    test('rejects more than one reserved namespace before any system change', async () => {
        const ctx = context([
            { originalDevclass: 'ZROOT', installDevclass: '/ACME/FOO' },
            { originalDevclass: 'ZSUB', installDevclass: '/OTHER/SUB' }
        ]);
        await expect(addNamespace.run(ctx)).rejects.toThrow('SAP packages must use at most one namespace, found: /ACME/, /OTHER/.');
        expect(SystemConnector.getNamespace).not.toHaveBeenCalled();
        expect(SystemConnector.addNamespace).not.toHaveBeenCalled();
        expect(ctx.revert.namespace).toBeUndefined();
    });

    test('rejects more than one reserved namespace in the original package names', async () => {
        const ctx = context([], true);
        ctx.runtime.package.hierarchy = { devclass: '/ACME/ROOT', sub: [{ devclass: '/OTHER/SUB', sub: [] }] };
        await expect(addNamespace.run(ctx)).rejects.toThrow('found: /ACME/, /OTHER/.');
        expect(SystemConnector.addNamespace).not.toHaveBeenCalled();
    });

    test('ignores stored mappings of devclasses no longer in the release', async () => {
        const ctx = context([
            { originalDevclass: 'ZROOT', installDevclass: '/ACME/FOO' },
            { originalDevclass: 'ZSUB', installDevclass: '/ACME/SUB' },
            { originalDevclass: 'ZREMOVED', installDevclass: '/OTHER/OLD' }
        ]);
        await addNamespace.run(ctx);
        expect(ctx.runtime.namespace).toBe('/ACME/');
    });

    test('installs a /X/ package into another existing namespace', async () => {
        const ctx = context([
            { originalDevclass: '/X/ROOT', installDevclass: '/N/ROOT' },
            { originalDevclass: '/X/SUB', installDevclass: '/N/SUB' }
        ]);
        ctx.runtime.package.hierarchy = { devclass: '/X/ROOT', sub: [{ devclass: '/X/SUB', sub: [] }] };
        await addNamespace.run(ctx);
        expect(ctx.runtime.namespace).toBe('/N/');
        expect(SystemConnector.getNamespace).toHaveBeenCalledWith('/N/');
        expect(SystemConnector.addNamespace).not.toHaveBeenCalled();
    });

    test('installs a /X/ package into another namespace only if it exists', async () => {
        const ctx = context([{ originalDevclass: '/X/ROOT', installDevclass: '/N/ROOT' }]);
        ctx.runtime.package.hierarchy = { devclass: '/X/ROOT', sub: [] };
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue(undefined);
        await expect(addNamespace.run(ctx)).rejects.toThrow("Namespace /N/ doesn't exist in TST. Manually add namespace in SE03.");
        expect(SystemConnector.addNamespace).not.toHaveBeenCalled();
    });

    test('creates the manifest namespace of a subpackage when original names are kept', async () => {
        const ctx = context([], true);
        ctx.runtime.package.hierarchy = { devclass: 'ZROOT', sub: [{ devclass: '/X/SUB', sub: [] }] };
        ctx.runtime.package.data.manifest = {
            namespace: { ns: '/X/', replicense: 'license', texts: [{ language: 'E', description: 'X', owner: 'owner' }] }
        };
        ctx.rawInput.installData.installDevclass.skipNamespace = false;
        (SystemConnector.getNamespace as jest.Mock).mockResolvedValue(undefined);
        await addNamespace.run(ctx);
        expect(SystemConnector.addNamespace).toHaveBeenCalledWith('/X/', 'license', [
            { namespace: '/X/', spras: 'E', descriptn: 'X', owner: 'owner' }
        ]);
        expect(ctx.revert.namespace).toBe('/X/');
    });
});
