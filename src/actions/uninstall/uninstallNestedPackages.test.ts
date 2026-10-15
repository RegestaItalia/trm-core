jest.mock('.', () => ({
    uninstallWithRollback: jest.fn()
}));

jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getSubpackages: jest.fn(),
        getDest: jest.fn(() => 'TST')
    }
}));

jest.mock('../../transport', () => ({
    Transport: jest.fn()
}));

import { Inquirer, Logger } from 'trm-commons';
import { uninstallWithRollback } from '.';
import { Transport } from '../../transport';
import { uninstallNestedPackages, withoutNestedDirtyEntries } from './uninstallNestedPackages';

function trmPackage(name: string, devclass: string) {
    return { packageName: name, registry: { endpoint: 'public' }, getDevclass: () => devclass } as any;
}

function nestedContext() {
    const pkg = trmPackage('pkg', 'ZPKG');
    const nested = trmPackage('nested', 'ZNESTED');
    const deeper = trmPackage('deeper', 'ZDEEPER');
    const sibling = trmPackage('sibling', 'ZSIBLING');
    const unrelated = trmPackage('unrelated', 'ZOTHER');
    const ctx = {
        uninstallingPackages: [trmPackage('parent', 'ZPARENT')],
        rawInput: {
            packageData: { name: 'pkg' },
            contextData: { noInquirer: true, systemPackages: [pkg, nested, deeper, sibling, unrelated] },
            uninstallData: { checks: { ignoreDirty: true }, landscapeTransport: { targetSystem: 'QAS' } }
        },
        runtime: {
            update: pkg,
            nestedPackages: { outermost: [nested, sibling], all: [nested, deeper, sibling] },
            nestedRollbacks: [],
            nestedReleases: []
        }
    } as any;
    return { ctx, pkg, nested, deeper, sibling, unrelated };
}

describe('uninstallNestedPackages', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
    });

    function result(name: string) {
        return { output: { manifest: { name } }, rollback: jest.fn().mockResolvedValue(undefined), release: jest.fn().mockResolvedValue(undefined) };
    }

    test('is skipped when no TRM package is installed under the uninstalled one', async () => {
        const { ctx } = nestedContext();
        ctx.runtime.nestedPackages = { outermost: [], all: [] };

        expect(await uninstallNestedPackages.filter(ctx)).toBe(false);
    });

    test('runs the uninstall action for the outermost nested packages, with the same options', async () => {
        const { ctx, pkg, nested, deeper, sibling, unrelated } = nestedContext();
        const nestedResult = result('nested');
        const siblingResult = result('sibling');
        (uninstallWithRollback as jest.Mock).mockResolvedValueOnce(nestedResult).mockResolvedValueOnce(siblingResult);

        expect(await uninstallNestedPackages.filter(ctx)).toBe(true);
        await uninstallNestedPackages.run(ctx);

        expect(Logger.warning).toHaveBeenCalledWith(expect.stringContaining('3 TRM package(s) installed in the SAP packages of pkg will be deleted too: nested, deeper, sibling'), { important: true });
        expect(uninstallWithRollback).toHaveBeenCalledTimes(2);
        const [input, deleting] = (uninstallWithRollback as jest.Mock).mock.calls[0];
        expect(input).toEqual({
            contextData: { noInquirer: true, systemPackages: [pkg, nested, deeper, sibling, unrelated] },
            packageData: { name: 'nested', registry: nested.registry },
            uninstallData: { checks: { ignoreDirty: true }, landscapeTransport: { targetSystem: 'QAS' } },
            // their deletions are carried by the landscape transport of this uninstall
            nested: true
        });
        // Options are copies: the nested uninstall normalizes its own input.
        expect(input.uninstallData.checks).not.toBe(ctx.rawInput.uninstallData.checks);
        expect(deleting).toEqual([ctx.uninstallingPackages[0], pkg, deeper, sibling]);
        expect((uninstallWithRollback as jest.Mock).mock.calls[1][0].packageData.name).toBe('sibling');
        expect(ctx.runtime.nestedRollbacks).toEqual([nestedResult.rollback, siblingResult.rollback]);
        expect(ctx.runtime.nestedReleases).toEqual([nestedResult.release, siblingResult.release]);
        expect(ctx.rawInput.contextData.systemPackages).toEqual([pkg, unrelated]);
    });

    test('with prompts, deleting the nested packages is confirmed first, default no', async () => {
        const { ctx } = nestedContext();
        ctx.rawInput.contextData.noInquirer = false;
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ uninstallNested: false });

        await expect(uninstallNestedPackages.run(ctx)).rejects.toThrow('Uninstall aborted.');

        expect(prompt).toHaveBeenCalledWith(expect.objectContaining({
            name: 'uninstallNested',
            default: false,
            message: '3 TRM package(s) installed in the SAP packages of pkg will be deleted too: nested, deeper, sibling. Continue?'
        }));
        expect(uninstallWithRollback).not.toHaveBeenCalled();
    });

    test('records the objects removed by the nested deletion transports', async () => {
        const { ctx } = nestedContext();
        const nestedResult: any = result('nested');
        nestedResult.output.transport = { getE071: jest.fn(async () => [
            { pgmid: '*', object: 'ZTRM', objName: 'name=nested' },
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZNESTED' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'ZNESTED_PROG' }
        ]) };
        (uninstallWithRollback as jest.Mock).mockResolvedValueOnce(nestedResult).mockResolvedValueOnce(result('sibling'));

        await uninstallNestedPackages.run(ctx);

        expect(ctx.runtime.deletedObjects).toEqual([
            { pgmid: 'R3TR', object: 'DEVC', objName: 'ZNESTED' },
            { pgmid: 'R3TR', object: 'PROG', objName: 'ZNESTED_PROG' }
        ]);
    });

    test('a failed nested uninstall rolls back the ones already deleted', async () => {
        const { ctx, nested } = nestedContext();
        const nestedResult = result('nested');
        (uninstallWithRollback as jest.Mock).mockResolvedValueOnce(nestedResult).mockRejectedValueOnce(new Error('sibling uninstall failed'));

        await expect(uninstallNestedPackages.run(ctx)).rejects.toThrow('sibling uninstall failed');
        // Still installed: the package cleanup must keep treating them as other installations.
        expect(ctx.rawInput.contextData.systemPackages).toContain(nested);
        expect(ctx.runtime.nestedReleases).toEqual([nestedResult.release]);

        await uninstallNestedPackages.revert(ctx);
        expect(nestedResult.rollback).toHaveBeenCalledTimes(1);
    });

    test('rollback attempts every nested restore, in reverse order, and reports the first failure', async () => {
        const { ctx } = nestedContext();
        const nestedResult = result('nested');
        const siblingResult = result('sibling');
        siblingResult.rollback.mockRejectedValue(new Error('sibling restore failed'));
        nestedResult.rollback.mockRejectedValue(new Error('nested restore failed'));
        (uninstallWithRollback as jest.Mock).mockResolvedValueOnce(nestedResult).mockResolvedValueOnce(siblingResult);
        await uninstallNestedPackages.run(ctx);

        await expect(uninstallNestedPackages.revert(ctx)).rejects.toThrow('sibling restore failed');

        expect(nestedResult.rollback).toHaveBeenCalledTimes(1);
        expect(siblingResult.rollback.mock.invocationCallOrder[0]).toBeLessThan(nestedResult.rollback.mock.invocationCallOrder[0]);
    });
});

describe('withoutNestedDirtyEntries', () => {
    const owners: Record<string, string> = { NESTEDK01: 'nested', OWNK01: 'pkg', USERK01: undefined };

    function entry(trkorr: string, objName: string) {
        return { trkorr, pgmid: 'R3TR', object: 'PROG', objName, as4Text: '' };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        (Transport as unknown as jest.Mock).mockImplementation((trkorr: string) => ({
            getTrmPackageName: jest.fn(async () => owners[trkorr])
        }));
    });

    test('drops the install transports and the own changes of nested packages', async () => {
        const nested = { packageName: 'nested', getDirtyEntries: () => [entry('USERK01', 'ZNESTED_EDIT')] } as any;
        const entries = [
            entry('NESTEDK01', 'ZNESTED_PROG'),
            entry('USERK01', 'ZNESTED_EDIT'),
            entry('USERK01', 'ZPKG_EDIT'),
            entry('OWNK01', 'ZPKG_PROG')
        ];

        await expect(withoutNestedDirtyEntries(entries, [nested])).resolves.toEqual([
            entry('USERK01', 'ZPKG_EDIT'),
            entry('OWNK01', 'ZPKG_PROG')
        ]);
    });

    test('keeps every entry without nested packages', async () => {
        const entries = [entry('NESTEDK01', 'ZNESTED_PROG')];

        await expect(withoutNestedDirtyEntries(entries, [])).resolves.toBe(entries);
        expect(Transport).not.toHaveBeenCalled();
    });
});
