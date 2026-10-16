import { Logger } from 'trm-commons';
import { logObjectsLocks } from './objectsLocks';

describe('logObjectsLocks', () => {
    afterEach(() => jest.restoreAllMocks());

    test('lists the locks in a table, sorted by transport', () => {
        const error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);
        const table = jest.spyOn(Logger, 'table').mockImplementation(() => undefined as never);
        logObjectsLocks([
            { trkorr: 'A4HK900002', pgmid: 'R3TR', object: 'PROG', objName: 'ZB' },
            { trkorr: 'A4HK900001', pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_A' }
        ] as any);
        expect(error).toHaveBeenCalledWith('2 objects are currently locked in transport requests', { important: true });
        expect(table).toHaveBeenCalledWith(['Transport', 'PGMID', 'Object', 'Object name'], [
            ['A4HK900001', 'R3TR', 'CLAS', 'ZCL_A'],
            ['A4HK900002', 'R3TR', 'PROG', 'ZB']
        ]);
    });

    test('logs nothing without locks', () => {
        const error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined as never);
        const table = jest.spyOn(Logger, 'table').mockImplementation(() => undefined as never);
        logObjectsLocks([]);
        expect(error).not.toHaveBeenCalled();
        expect(table).not.toHaveBeenCalled();
    });
});
