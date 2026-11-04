jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        createTocTransport: jest.fn(),
        createWbTransport: jest.fn(),
        createCustTransport: jest.fn(),
        writeBinaryFile: jest.fn(),
        getDirTrans: jest.fn(),
        getFileSystem: jest.fn(),
        importTransport: jest.fn(),
        forwardTransport: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { Transport } from './Transport';
import { TrmTransportIdentifier } from './TrmTransportIdentifier';
import { ActionLogWriter, runWithActionLog, setActionLogWriter } from '../actionLog';

describe('Transport action log', () => {
    let writer: jest.Mocked<ActionLogWriter>;

    beforeEach(() => {
        jest.resetAllMocks();
        for (const method of ['loading', 'log', 'success', 'warning', 'error'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        (SystemConnector.getDest as jest.Mock).mockReturnValue('TST');
        writer = {
            logActionStart: jest.fn().mockResolvedValue(undefined),
            logActionEnd: jest.fn().mockResolvedValue(undefined),
            logTransportEvents: jest.fn().mockResolvedValue(undefined)
        };
        setActionLogWriter(writer);
    });

    afterEach(() => {
        setActionLogWriter(undefined);
        jest.restoreAllMocks();
    });

    const events = () => writer.logTransportEvents.mock.calls.map(call => call[1]).flat();

    test('created transports are recorded with their role', async () => {
        (SystemConnector.createTocTransport as jest.Mock).mockResolvedValueOnce('TSTK900001').mockResolvedValueOnce('TSTK900002').mockResolvedValueOnce('TSTK900003');
        (SystemConnector.createWbTransport as jest.Mock).mockResolvedValueOnce('TSTK900004').mockResolvedValueOnce('TSTK900005');
        (SystemConnector.createCustTransport as jest.Mock).mockResolvedValueOnce('TSTK900006');

        await runWithActionLog({ actionName: 'publish' }, async () => {
            await Transport.createToc({ text: '@X1@TRM pkg 1.0.0', target: 'TST', trmIdentifier: TrmTransportIdentifier.TADIR });
            await Transport.createToc({ text: '@X1@TRM (BKP) pkg 1.0.0', target: 'TST' });
            await Transport.createToc({ text: '@X1@TRM (DELE) pkg 1.0.0', target: 'TST' });
            await Transport.createWb({ text: '@X1@TRM pkg 1.0.0' });
            await Transport.createLang({ text: '@X1@TRM (L) pkg 1.0.0', target: 'TST' });
            await Transport.createCust({ text: '@X1@TRM pkg 1.0.0', target: 'TST' });
        });

        expect(events()).toEqual([
            { trkorr: 'TSTK900001', event: 'CREATE', role: 'TADIR' },
            { trkorr: 'TSTK900002', event: 'CREATE', role: 'BKP' },
            { trkorr: 'TSTK900003', event: 'CREATE', role: 'DELE' },
            { trkorr: 'TSTK900004', event: 'CREATE', role: 'LAND' },
            { trkorr: 'TSTK900005', event: 'CREATE', role: 'LANG' },
            { trkorr: 'TSTK900006', event: 'CREATE', role: 'CUST' }
        ]);
    });

    test('an import is recorded with its return code and the uploaded role, a test import is not', async () => {
        jest.spyOn(Transport as any, '_getFilePaths').mockResolvedValue({ header: 'K', data: 'R' });
        (SystemConnector.importTransport as jest.Mock).mockResolvedValue({ tpRetCode: '0004', tpStdout: [] });

        await runWithActionLog({ actionName: 'install' }, async () => {
            const transport = await Transport.upload('TRMK900001', { binary: { header: Buffer.from('h'), data: Buffer.from('d') }, trTarget: 'TST', logRole: 'TADIR' });
            jest.spyOn(transport as any, '_isInTmsQueue').mockResolvedValue({ rc: 4 });
            await transport.import(true);
            await transport.import(false);
        });

        expect(events()).toEqual([
            { trkorr: 'TRMK900001', event: 'IMPORT', target: 'TST', retcode: 4, role: 'TADIR' }
        ]);
    });
});
