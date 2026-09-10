jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getDevclass: jest.fn().mockResolvedValue(undefined)
    }
}));

jest.mock('../../transport', () => {
    class MockTransport {
        static createToc = jest.fn();
        static upload = jest.fn();
        static getTransportIcon = jest.fn(() => 'TR');
        trkorr = 'DEVK900001';
        release = jest.fn();
        download = jest.fn();
        canBeDeleted = jest.fn();
        delete = jest.fn();
        import = jest.fn();
    }
    return {
        Transport: MockTransport,
        TrmTransportIdentifier: { DEVC: 'DEVC', TADIR: 'TADIR', LANG: 'LANG', CUST: 'CUST' }
    };
});

import execute, { Step } from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { prepareDevc } from './prepareDevc';
import { prepareTadir } from './prepareTadir';
import { prepareLang } from './prepareLang';
import { prepareCust } from './prepareCust';

type Kind = 'devc' | 'tadir' | 'lang' | 'cust';

function context(registryTransport: jest.Mock) {
    const binary = (name: string) => ({
        trkorr: `ORIG-${name}`,
        entries: { tadir: [], tdevc: [] },
        binaries: undefined
    });
    return {
        rawInput: {
            packageData: {
                name: 'pkg',
                registry: { transport: registryTransport }
            },
            installData: {
                import: { noLang: false, noCust: false },
                installDevclass: { keepOriginal: true }
            }
        },
        runtime: {
            stopWarningShown: true,
            package: { hierarchy: { devclass: 'ZROOT' }, data: { transports: [] } },
            transports: {
                devc: { binaries: binary('DEVC'), instance: undefined },
                tadir: { binaries: binary('TADIR'), instance: undefined },
                lang: { binaries: binary('LANG'), instance: undefined },
                cust: [{ binaries: binary('CUST'), instance: undefined }]
            }
        },
        revert: {
            transports: { devc: undefined, tadir: undefined, lang: undefined, cust: [] },
            createdTransports: { devc: undefined, tadir: undefined, lang: undefined, cust: [] },
            cleanupImported: false,
            cleanupSucceeded: false,
            importStarted: false,
            importedEntries: [],
            sapPackages: [],
            namespace: undefined
        }
    } as any;
}

describe('install prepare transport rollback', () => {
    let dummy: any;
    let incoming: any;
    let registryTransport: jest.Mock;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        for (const method of ['loading', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(SystemConnector, 'getDevclass').mockResolvedValue(undefined);

        dummy = new Transport('DEVK900001') as any;
        dummy.release.mockResolvedValue(undefined);
        dummy.download.mockResolvedValue({ binaries: { header: Buffer.from('h'), data: Buffer.from('d') } });
        dummy.canBeDeleted.mockResolvedValue(true);
        dummy.delete.mockResolvedValue(undefined);
        incoming = new Transport('DEVK900001') as any;
        incoming.import.mockResolvedValue(0);
        registryTransport = jest.fn().mockResolvedValue({ header: Buffer.from('nh'), data: Buffer.from('nd') });
        jest.spyOn(Transport, 'createToc').mockResolvedValue(dummy);
        jest.spyOn(Transport, 'upload').mockResolvedValue(incoming);
    });

    const cases: Array<[Kind, Step<any>]> = [
        ['devc', prepareDevc],
        ['tadir', prepareTadir],
        ['lang', prepareLang],
        ['cust', prepareCust]
    ];

    async function runFailure(kind: Kind, step: Step<any>, point: string) {
        const ctx = context(registryTransport);
        if (point === 'release') dummy.release.mockRejectedValue(new Error('release failed'));
        if (point === 'download') dummy.download.mockRejectedValue(new Error('download failed'));
        if (point === 'registry') registryTransport.mockRejectedValue(new Error('registry failed'));
        if (point === 'upload') (Transport.upload as jest.Mock).mockRejectedValue(new Error('upload failed'));
        if (point === 'testImport') incoming.import.mockRejectedValue(new Error('test import failed'));

        await expect(execute('test', [step], ctx)).rejects.toThrow();

        const tracked = kind === 'cust'
            ? ctx.revert.createdTransports.cust[0]
            : ctx.revert.createdTransports[kind];
        expect(tracked).toBe(dummy);
        expect(dummy.canBeDeleted).toHaveBeenCalled();
        expect(dummy.delete).toHaveBeenCalled();
    }

    describe.each(cases)('%s preparation', (kind, step) => {
        test.each(['release', 'registry', 'upload', 'testImport'])('%s failure cleans the generated dummy', async point => {
            await runFailure(kind, step, point);
        });

        test('download failure is tolerated but later failure still deletes the tracked dummy', async () => {
            dummy.download.mockRejectedValue(new Error('download failed'));
            registryTransport.mockRejectedValue(new Error('registry failed'));
            await runFailure(kind, step, 'registry');
        });

        test('does not restore or delete the dummy when deletion cleanup failed', async () => {
            const ctx = context(registryTransport);
            ctx.revert.cleanupImported = true;
            ctx.revert.cleanupSucceeded = false;
            if (kind === 'cust') {
                ctx.revert.createdTransports.cust.push(dummy);
            } else {
                ctx.revert.createdTransports[kind] = dummy;
            }

            await step.revert(ctx);

            expect(dummy.canBeDeleted).not.toHaveBeenCalled();
            expect(dummy.delete).not.toHaveBeenCalled();
            expect(Transport.upload).not.toHaveBeenCalled();
        });
    });
});
