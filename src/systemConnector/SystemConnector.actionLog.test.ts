import { Logger } from 'trm-commons';
import { SystemConnector } from './SystemConnector';
import { runWithActionLog } from '../actionLog';

describe('SystemConnector action log', () => {
    let connector: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        connector = {
            checkConnection: jest.fn().mockResolvedValue(true),
            releaseTrkorr: jest.fn().mockResolvedValue(undefined),
            forwardTransport: jest.fn().mockResolvedValue(undefined),
            deleteTrkorr: jest.fn().mockResolvedValue(undefined),
            deleteTmsTransport: jest.fn().mockResolvedValue(undefined),
            logActionStart: jest.fn().mockResolvedValue(undefined),
            logActionEnd: jest.fn().mockResolvedValue(undefined),
            logTransportEvents: jest.fn().mockResolvedValue(undefined)
        };
        SystemConnector.systemConnector = connector;
    });

    test('transport changes of a running action are written to the action log through the connector', async () => {
        await runWithActionLog({ actionName: 'install' }, async () => {
            await SystemConnector.releaseTrkorr('TSTK900001', false);
            await SystemConnector.forwardTransport('TSTK900001', 'TST', 'TST', true);
            await SystemConnector.deleteTmsTransport('TSTK900001', 'TST');
            await SystemConnector.deleteTrkorr('TSTK900002');
        });

        const actionId = connector.logActionStart.mock.calls[0][0].actionId;
        expect(connector.logTransportEvents.mock.calls).toEqual([
            [actionId, [{ trkorr: 'TSTK900001', event: 'RELEASE', role: undefined }]],
            [actionId, [{ trkorr: 'TSTK900001', event: 'FORWARD', target: 'TST', role: undefined }]],
            [actionId, [{ trkorr: 'TSTK900001', event: 'DEQUEUE', target: 'TST', role: undefined }]],
            [actionId, [{ trkorr: 'TSTK900002', event: 'DELETE', role: undefined }]]
        ]);
        expect(connector.logActionEnd).toHaveBeenCalledWith(actionId, 'S', undefined);
    });

    test('a failed change is not recorded', async () => {
        connector.deleteTmsTransport.mockRejectedValue(new Error('not in queue'));

        await expect(runWithActionLog({ actionName: 'install' }, () => SystemConnector.deleteTmsTransport('TSTK900001', 'TST'))).rejects.toThrow('not in queue');

        expect(connector.logTransportEvents).not.toHaveBeenCalled();
        expect(connector.logActionEnd.mock.calls[0][1]).toBe('F');
    });

    test('outside an action nothing is written', async () => {
        await SystemConnector.releaseTrkorr('TSTK900001', false);

        expect(connector.logTransportEvents).not.toHaveBeenCalled();
    });
});
