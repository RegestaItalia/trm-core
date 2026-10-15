import { SystemConnector } from './SystemConnector';

describe('SystemConnector connection checks', () => {
    let connector: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        connector = {
            checkConnection: jest.fn().mockResolvedValue(true),
            connect: jest.fn().mockResolvedValue(undefined),
            getDest: jest.fn(() => 'TST'),
            getLogonUser: jest.fn(() => 'USER'),
            getTransportStatus: jest.fn().mockResolvedValue('R')
        };
        SystemConnector.systemConnector = connector;
    });

    test('calls check the connection at most once per interval', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(1000);

        await SystemConnector.getTransportStatus('TSTK1');
        await SystemConnector.getTransportStatus('TSTK2');
        expect(connector.checkConnection).toHaveBeenCalledTimes(1);

        now.mockReturnValue(1000 + SystemConnector.CONNECTION_CHECK_INTERVAL_MS);
        await SystemConnector.getTransportStatus('TSTK3');
        expect(connector.checkConnection).toHaveBeenCalledTimes(2);
        expect(connector.getTransportStatus).toHaveBeenCalledTimes(3);
    });

    test('synchronous getters never check the connection', () => {
        expect(SystemConnector.getDest()).toBe('TST');
        expect(SystemConnector.getLogonUser()).toBe('USER');
        expect(connector.checkConnection).not.toHaveBeenCalled();
    });

    test('a failed check is repeated by the next call', async () => {
        connector.checkConnection.mockRejectedValueOnce(new Error('connection lost'));

        await expect(SystemConnector.getTransportStatus('TSTK1')).rejects.toThrow('connection lost');
        await SystemConnector.getTransportStatus('TSTK1');
        expect(connector.checkConnection).toHaveBeenCalledTimes(2);
    });

    test('a reconnection is checked again by the next call', async () => {
        await SystemConnector.getTransportStatus('TSTK1');
        await SystemConnector.connect(true);
        await SystemConnector.getTransportStatus('TSTK1');
        expect(connector.checkConnection).toHaveBeenCalledTimes(2);
    });

    test('an uninitialized connector fails', () => {
        SystemConnector.systemConnector = undefined;
        expect(() => SystemConnector.getDest()).toThrow('System connector not initialized.');
    });
});
