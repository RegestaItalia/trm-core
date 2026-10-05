jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getInstallPackages: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { setInstallDevclass } from './setInstallDevclass';

describe('set-install-devclass namespace carry-over', () => {
    function context(installedRoot: string | undefined, previousInstallPackages: any[]) {
        return {
            rawInput: {
                packageData: { name: 'pkg' },
                contextData: { noInquirer: true },
                installData: {
                    installDevclass: {
                        replacements: [{ originalDevclass: 'ZORIG', installDevclass: 'ZROOT' }]
                    }
                }
            },
            runtime: {
                isTrmServer: false,
                isTrmRest: false,
                update: { getDevclass: () => installedRoot },
                previousInstallPackages,
                package: {
                    hierarchy: { devclass: 'ZORIG', sub: [{ devclass: 'ZORIG_NEW', sub: [] }] }
                }
            }
        } as any;
    }

    beforeEach(() => {
        for (const method of ['loading', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('uses the installed root devclass namespace', async () => {
        const ctx = context('/INST/ROOT', []);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZORIG_NEW', installDevclass: '/INST/ORIG_NEW'
        });
    });

    test('falls back to the stored root replacement when the installed root devclass is unknown', async () => {
        const ctx = context(undefined, [{ originalDevclass: 'ZORIG', installDevclass: '/STORED/ROOT' }]);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZORIG_NEW', installDevclass: '/STORED/ORIG_NEW'
        });
    });

    test('keeps the original namespace when neither the installed nor the stored root is known', async () => {
        const ctx = context(undefined, []);
        await setInstallDevclass.run(ctx);
        expect(ctx.rawInput.installData.installDevclass.replacements).toContainEqual({
            originalDevclass: 'ZORIG_NEW', installDevclass: 'ZORIG_NEW'
        });
    });
});
