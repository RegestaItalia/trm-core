jest.mock('trm-commons', () => ({
    Logger: {
        loading: jest.fn(),
        success: jest.fn(),
        log: jest.fn(),
        warning: jest.fn(),
        error: jest.fn()
    },
    getGlobalNodeModules: jest.fn()
}));

import { Logger } from 'trm-commons';
import { RFCClient } from './RFCClient';
import { RFCClientError } from './RFCClientError';
import { parseMessageLog } from './messageLog';

function abapError(key: string) {
    return {
        key,
        abapMsgClass: '/ATRM/MSG',
        abapMsgNumber: '001',
        abapMsgV1: 'V1'
    };
}

function createClient(call: jest.Mock): RFCClient {
    const client = new RFCClient({}, 'EN');
    (client as any)._rfcClient = { call };
    return client;
}

function mockCalls(handlers: Record<string, () => any>): jest.Mock {
    return jest.fn(async (fm: string) => {
        const handler = handlers[fm];
        if (!handler) {
            throw new Error(`Unexpected call ${fm}`);
        }
        return handler();
    });
}

const t100 = () => ({
    DATA: [{ WA: 'E|/ATRM/MSG|001|Forward failed &1' }],
    FIELDS: [{ FIELDNAME: 'SPRSL' }, { FIELDNAME: 'ARBGB' }, { FIELDNAME: 'MSGNR' }, { FIELDNAME: 'TEXT' }]
});

describe('RFCClient exception log', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads the exception log after a trm-server exception and prints it', async () => {
        const call = mockCalls({
            '/ATRM/FORWARD_TR': () => { throw abapError('GENERIC'); },
            'RFC_READ_TABLE': t100,
            '/ATRM/GET_EXCEPTION_LOG': () => ({ LOG: [{ TDFORMAT: '', TDLINE: 'tp line 1  ' }, { TDFORMAT: '', TDLINE: 'tp line 2' }] })
        });
        const client = createClient(call);

        const error = await client.forwardTransport('A4HK900001', 'QAS', 'DEV').catch(e => e);

        expect(error).toBeInstanceOf(RFCClientError);
        expect(error.message).toBe('Forward failed V1');
        expect(error.messageLog).toEqual(['tp line 1', 'tp line 2']);
        expect(call.mock.calls.map(c => c[0])).toEqual(['/ATRM/FORWARD_TR', 'RFC_READ_TABLE', '/ATRM/GET_EXCEPTION_LOG']);
        expect(Logger.log).toHaveBeenCalledWith('Exception log:\ntp line 1\ntp line 2', true);
    });

    it('keeps the original error when the exception log function is missing', async () => {
        const call = mockCalls({
            '/ATRM/FORWARD_TR': () => { throw abapError('GENERIC'); },
            'RFC_READ_TABLE': t100,
            '/ATRM/GET_EXCEPTION_LOG': () => { throw { key: 'FU_NOT_FOUND', message: 'Function not found' }; }
        });
        const client = createClient(call);

        const error = await client.forwardTransport('A4HK900001', 'QAS', 'DEV').catch(e => e);

        expect(error).toBeInstanceOf(RFCClientError);
        expect(error.exceptionType).toBe('GENERIC');
        expect(error.message).toBe('Forward failed V1');
        expect(error.messageLog).toBeUndefined();
    });

    it('leaves the log undefined when the exception has none', async () => {
        const call = mockCalls({
            '/ATRM/FORWARD_TR': () => { throw abapError('GENERIC'); },
            'RFC_READ_TABLE': t100,
            '/ATRM/GET_EXCEPTION_LOG': () => ({ LOG: [] })
        });
        const client = createClient(call);

        const error = await client.forwardTransport('A4HK900001', 'QAS', 'DEV').catch(e => e);

        expect(error.messageLog).toBeUndefined();
        expect(Logger.log).not.toHaveBeenCalledWith(expect.stringContaining('Exception log'), true);
    });

    it('does not read the exception log for unauthorized calls', async () => {
        const call = mockCalls({
            '/ATRM/FORWARD_TR': () => { throw abapError('TRM_RFC_UNAUTHORIZED'); },
            'RFC_READ_TABLE': t100
        });
        const client = createClient(call);

        const error = await client.forwardTransport('A4HK900001', 'QAS', 'DEV').catch(e => e);

        expect(error.exceptionType).toBe('TRM_RFC_UNAUTHORIZED');
        expect(call.mock.calls.map(c => c[0])).not.toContain('/ATRM/GET_EXCEPTION_LOG');
    });

    it('does not read the exception log for non trm-server functions', async () => {
        const call = mockCalls({
            'STFC_CONNECTION': () => { throw abapError('SYSTEM_FAILURE'); },
            'RFC_READ_TABLE': t100
        });
        const client = createClient(call);

        await expect(client.checkConnection()).rejects.toBeInstanceOf(RFCClientError);
        expect(call.mock.calls.map(c => c[0])).not.toContain('/ATRM/GET_EXCEPTION_LOG');
    });
});

describe('parseMessageLog', () => {
    it('accepts REST string lines and RFC TLINE rows', () => {
        expect(parseMessageLog(['a ', 'b'])).toEqual(['a', 'b']);
        expect(parseMessageLog([{ tdline: 'a' }])).toEqual(['a']);
    });

    it('returns undefined for missing or blank logs', () => {
        expect(parseMessageLog(undefined)).toBeUndefined();
        expect(parseMessageLog([])).toBeUndefined();
        expect(parseMessageLog(['  ', ''])).toBeUndefined();
    });
});

describe('RFCClient deleteTmsTransport', () => {
    it('normalizes the transport and the target system like forwardTransport', async () => {
        const call = mockCalls({ '/ATRM/DEL_TRANSPORT_TMS': () => ({}) });
        const client = createClient(call);

        await client.deleteTmsTransport(' devk9dele ', 'qas ');

        expect(call).toHaveBeenCalledWith('/ATRM/DEL_TRANSPORT_TMS', { TRKORR: 'DEVK9DELE', SYSTEM: 'QAS' }, undefined);
    });
});

describe('RFCClient getDest', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads the system ID from trm-server', async () => {
        const call = mockCalls({
            '/ATRM/GET_DEST': () => ({ DEST: 'A4H' })
        });

        await expect(createClient(call).getDest()).resolves.toBe('A4H');
        expect(call).toHaveBeenCalledTimes(1);
    });

    it.each(['FU_NOT_FOUND', 'TRM_RFC_UNAUTHORIZED'])('falls back to RFC_SYSTEM_INFO on %s', async (key) => {
        const call = mockCalls({
            '/ATRM/GET_DEST': () => { throw { key }; },
            'RFC_SYSTEM_INFO': () => ({ RFCSI_EXPORT: { RFCSYSID: 'A4H' } })
        });

        await expect(createClient(call).getDest()).resolves.toBe('A4H');
        expect(call.mock.calls.map(c => c[0])).toEqual(['/ATRM/GET_DEST', 'RFC_SYSTEM_INFO']);
    });

    it('does not fall back on other errors', async () => {
        const call = mockCalls({
            '/ATRM/GET_DEST': () => { throw { key: 'GENERIC' }; }
        });

        await expect(createClient(call).getDest()).rejects.toBeInstanceOf(RFCClientError);
        expect(call.mock.calls.map(c => c[0])).toEqual(['/ATRM/GET_DEST']);
    });
});

describe('RFCClient getTransportEntries', () => {
    const payload = (values: string) => Buffer.from(`<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><ENTRIES>${values}</ENTRIES></asx:values></asx:abap>`);

    test('reads rows named after their DDIC row type', async () => {
        const call = mockCalls({
            '/ATRM/GET_TRANSPORT_ENTRIES': () => ({
                ENTRIES: payload(
                    '<E071><E071><TRKORR>A4HK900131</TRKORR><PGMID>*</PGMID><OBJECT>ZTRM</OBJECT><OBJ_NAME>name=@test/ztest</OBJ_NAME><OBJFUNC/></E071>' +
                    '<E071><TRKORR>A4HK900131</TRKORR><PGMID>R3TR</PGMID><OBJECT>CLAS</OBJECT><OBJ_NAME>ZCL_TEST</OBJ_NAME><OBJFUNC/></E071></E071>' +
                    '<TADIR><TADIR><PGMID>R3TR</PGMID><OBJECT>CLAS</OBJECT><OBJ_NAME>ZCL_TEST</OBJ_NAME><DEVCLASS>ZTEST</DEVCLASS><CREATED_ON>2026-10-10</CREATED_ON></TADIR></TADIR>' +
                    '<TDEVC/><TDEVCT/>'
                )
            })
        });

        const entries = await createClient(call).getTransportEntries('A4HK900131');

        expect(entries.e071).toEqual([
            { trkorr: 'A4HK900131', pgmid: '*', object: 'ZTRM', objName: 'name=@test/ztest', objfunc: '' },
            { trkorr: 'A4HK900131', pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_TEST', objfunc: '' }
        ]);
        expect(entries.tadir).toEqual([{ pgmid: 'R3TR', object: 'CLAS', objName: 'ZCL_TEST', devclass: 'ZTEST', createdOn: '2026-10-10' }]);
        expect(entries.tdevc).toEqual([]);
        expect(entries.tdevct).toEqual([]);
    });

    test('reads rows named item', async () => {
        const call = mockCalls({
            '/ATRM/GET_TRANSPORT_ENTRIES': () => ({
                ENTRIES: payload('<E071><item><PGMID>R3TR</PGMID><OBJECT>DEVC</OBJECT><OBJ_NAME>ZTEST</OBJ_NAME></item></E071><TADIR/><TDEVC><item><DEVCLASS>ZTEST</DEVCLASS></item></TDEVC><TDEVCT/>')
            })
        });

        const entries = await createClient(call).getTransportEntries('A4HK900131');

        expect(entries.e071).toEqual([{ pgmid: 'R3TR', object: 'DEVC', objName: 'ZTEST' }]);
        expect(entries.tdevc).toEqual([{ devclass: 'ZTEST' }]);
    });
});
