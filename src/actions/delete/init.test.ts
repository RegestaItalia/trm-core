jest.mock('../../systemConnector', () => ({
    TRM_SERVER_PACKAGE_NAME: 'trm-server',
    TRM_REST_PACKAGE_NAME: 'trm-rest',
    SystemConnector: {
        getInstallPackages: jest.fn(),
        getInstalledPackages: jest.fn(),
        getTransportTargets: jest.fn(),
        getDest: jest.fn(() => 'TST')
    }
}));

import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { RegistryProvider, RegistryType } from '../../registry';
import { TrmPackage } from '../../trmPackage';
import { init } from './init';
import { checkDependants } from './checkDependants';

function registry(type: RegistryType = RegistryType.PUBLIC) {
    if (type === RegistryType.PUBLIC) {
        return RegistryProvider.getRegistry();
    }
    return { endpoint: 'local', getRegistryType: () => type, compare: (o: any) => o === RegistryProvider.getRegistry() } as any;
}

function snapshot(name: string) {
    return { package_name: name, package_registry: 'public', manifest: Buffer.from('<xml/>'), trkorr: 'DEVK9INST', integrity: 'sha', devclass: 'ZPKG' };
}

function installed(name: string, options: { dirty?: boolean, dependencies?: any[], devclass?: string, snapshot?: boolean } = {}) {
    const pkg = new TrmPackage(name, registry(), {
        get: () => ({ name, version: '1.0.0', dependencies: options.dependencies || [] })
    } as any);
    pkg.setDevclass(options.devclass || 'ZPKG');
    if (options.dirty) {
        pkg.setDirtyEntries([{} as any]);
    }
    if (options.snapshot !== false) {
        pkg.setMetadataSnapshot(snapshot(name));
    }
    return pkg;
}

function context(name: string, systemPackages: TrmPackage[], type?: RegistryType, noInquirer = true) {
    return {
        rawInput: {
            packageData: { name, registry: registry(type) },
            contextData: { systemPackages, noInquirer }
        }
    } as any;
}

describe('delete init', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        jest.spyOn(Logger, 'info').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        (SystemConnector.getTransportTargets as jest.Mock).mockResolvedValue(['QAS']);
        (SystemConnector.getInstallPackages as jest.Mock).mockResolvedValue([{ originalDevclass: 'ZORIG', installDevclass: 'ZPKG' }]);
    });

    test('finds the installed package and its install mappings', async () => {
        const pkg = installed('pkg');
        const ctx = context('pkg', [installed('other'), pkg]);

        await init.run(ctx);

        expect(ctx.runtime.update).toBe(pkg);
        expect(ctx.runtime.previousInstallPackages).toEqual([{ originalDevclass: 'ZORIG', installDevclass: 'ZPKG' }]);
        expect(ctx.output.manifest.version).toBe('1.0.0');
        expect(ctx.revert.sapPackages).toEqual([]);
    });

    test('selects the landscape target that receives the deletion transport', async () => {
        const ctx = context('pkg', [installed('pkg')]);

        await init.run(ctx);

        expect(ctx.rawInput.deleteData.landscapeTransport.targetSystem).toBe('QAS');
    });

    test('final system of the landscape has no target', async () => {
        (SystemConnector.getTransportTargets as jest.Mock).mockResolvedValue([]);
        const ctx = context('pkg', [installed('pkg')]);

        await init.run(ctx);

        expect(ctx.rawInput.deleteData.landscapeTransport.targetSystem).toBeUndefined();
    });

    test('temporary packages are not deleted in the landscape', async () => {
        const ctx = context('pkg', [installed('pkg', { devclass: '$PKG' })]);

        await init.run(ctx);

        expect(SystemConnector.getTransportTargets).not.toHaveBeenCalled();
        expect(ctx.rawInput.deleteData.landscapeTransport.targetSystem).toBeUndefined();
    });

    test('rejects packages that are not installed', async () => {
        await expect(init.run(context('pkg', [installed('other')]))).rejects.toThrow('not installed');
    });

    test('rejects local registries', async () => {
        await expect(init.run(context('pkg', [installed('pkg')], RegistryType.LOCAL))).rejects.toThrow('local registry');
    });

    test('rejects TRM own packages', async () => {
        await expect(init.run(context('trm-server', [installed('trm-server')]))).rejects.toThrow('required by TRM');
    });

    test('dirty packages need confirmation', async () => {
        await expect(init.run(context('pkg', [installed('pkg', { dirty: true })]))).rejects.toThrow('Delete aborted.');

        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ ignoreDirty: true });
        const ctx = context('pkg', [installed('pkg', { dirty: true })], undefined, false);
        await init.run(ctx);
        expect(ctx.runtime.update.packageName).toBe('pkg');
    });

    test('a missing TRM packages table record is read again before any change', async () => {
        const pkg = installed('pkg', { snapshot: false });
        (SystemConnector.getInstalledPackages as jest.Mock).mockResolvedValue([installed('other'), installed('pkg')]);

        const ctx = context('pkg', [pkg]);
        await init.run(ctx);

        expect(SystemConnector.getInstalledPackages).toHaveBeenCalledWith(true);
        expect(ctx.runtime.update.getMetadataSnapshot()).toEqual(snapshot('pkg'));
    });

    test('aborts when the TRM packages table record still cannot be read', async () => {
        (SystemConnector.getInstalledPackages as jest.Mock).mockResolvedValue([installed('pkg', { snapshot: false })]);

        await expect(init.run(context('pkg', [installed('pkg', { snapshot: false })])))
            .rejects.toThrow('Delete aborted. The TRM packages table record of pkg could not be read from TST.');
        expect(SystemConnector.getInstallPackages).not.toHaveBeenCalled();
    });

    test('a record already read is not read again', async () => {
        await init.run(context('pkg', [installed('pkg')]));

        expect(SystemConnector.getInstalledPackages).not.toHaveBeenCalled();
    });

    test('dirty packages without prompts abort with the reason and the override', async () => {
        await expect(init.run(context('pkg', [installed('pkg', { dirty: true })])))
            .rejects.toThrow('pkg has changes made on TST that will be deleted: set the ignoreDirty check');
    });

    test('declined dirty confirmation aborts with the reason', async () => {
        jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ ignoreDirty: false });
        await expect(init.run(context('pkg', [installed('pkg', { dirty: true })], undefined, false)))
            .rejects.toThrow('Delete aborted. pkg has changes made on TST that will be deleted.');
    });

    test('ignoreDirty deletes dirty packages without prompts', async () => {
        const prompt = jest.spyOn(Inquirer, 'prompt');
        const ctx = context('pkg', [installed('pkg', { dirty: true })]);
        ctx.rawInput.deleteData = { checks: { ignoreDirty: true } };

        await init.run(ctx);

        expect(prompt).not.toHaveBeenCalled();
        expect(Logger.warning).toHaveBeenCalledWith('pkg has changes made on TST that will be deleted!');
        expect(ctx.runtime.update.packageName).toBe('pkg');
    });
});

describe('delete checkDependants', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(Logger, 'info').mockImplementation(() => undefined as never);
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
    });

    function dependantContext(noInquirer: boolean) {
        const pkg = installed('pkg');
        const dependant = installed('dependant', { dependencies: [{ name: 'pkg', version: '^1.0.0', registry: undefined }] });
        const ctx = context('pkg', [pkg, dependant], undefined, noInquirer);
        ctx.rawInput.deleteData = { checks: {} };
        ctx.runtime = { update: pkg };
        return ctx;
    }

    test('aborts without prompts when an installed package depends on it', async () => {
        const ctx = dependantContext(true);

        expect(await checkDependants.filter(ctx)).toBe(true);
        await expect(checkDependants.run(ctx)).rejects.toThrow('installed packages depend on "pkg"');
    });

    test('asks for confirmation when an installed package depends on it', async () => {
        const prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValueOnce({ ignoreDependants: true });

        await expect(checkDependants.run(dependantContext(false))).resolves.toBeUndefined();
        expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ type: 'confirm', default: false }));

        prompt.mockResolvedValueOnce({ ignoreDependants: false });
        await expect(checkDependants.run(dependantContext(false))).rejects.toThrow('Delete aborted');
    });

    test('passes when nothing depends on the package, and can be skipped', async () => {
        const pkg = installed('pkg');
        const ctx = context('pkg', [pkg, installed('other')]);
        ctx.rawInput.deleteData = { checks: { noDependants: true } };
        ctx.runtime = { update: pkg };

        await expect(checkDependants.run(ctx)).resolves.toBeUndefined();
        expect(await checkDependants.filter(ctx)).toBe(false);
    });
});
