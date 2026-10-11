jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getDirTrans: jest.fn(async () => '/usr/sap/trans'),
        getFileSystem: jest.fn(async () => ({ filesys: 'UNIX' })),
        getBinaryFile: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { RESTClientError, RFCClientError } from '../client';
import { Transport } from './Transport';

const HEADER = Buffer.from('header');
const DATA = Buffer.from('data');

function mockFiles(files: { header: any, data: any }) {
    (SystemConnector.getBinaryFile as jest.Mock).mockImplementation(async (filePath: string) => {
        const file = filePath.includes('cofiles') ? files.header : files.data;
        if (file instanceof Error) {
            throw file;
        }
        return file;
    });
}

describe('Transport.readBinaryFiles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'success', 'log'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
    });

    test('reads header and data from cofiles/data', async () => {
        mockFiles({ header: HEADER, data: DATA });

        await expect(Transport.readBinaryFiles('TSTK900001')).resolves.toEqual({ header: HEADER, data: DATA });

        expect(SystemConnector.getBinaryFile).toHaveBeenCalledWith('/usr/sap/trans/cofiles/K900001.TST');
        expect(SystemConnector.getBinaryFile).toHaveBeenCalledWith('/usr/sap/trans/data/R900001.TST');
    });

    test.each([
        ['RFC exception key', new RFCClientError('NOT_FOUND', null, null, 'File /usr/sap/trans/cofiles/K900001.TST not found')],
        ['REST reason (wrapped)', new RESTClientError('NOT_FOUND', null, null, 'File /usr/sap/trans/cofiles/K900001.TST not found')],
        ['REST reason (raw)', new Error('NOT_FOUND')]
    ])('a missing file (%s) is reported as absent', async (_, error) => {
        mockFiles({ header: error, data: DATA });

        await expect(Transport.readBinaryFiles('TSTK900001')).resolves.toEqual({ header: undefined, data: DATA });
    });

    test('an empty file is reported as absent', async () => {
        mockFiles({ header: HEADER, data: Buffer.alloc(0) });

        await expect(Transport.readBinaryFiles('TSTK900001')).resolves.toEqual({ header: HEADER, data: undefined });
    });

    test.each([
        ['generic RFC error', new RFCClientError('GENERIC', null, null, "Couldn't read file")],
        ['RFC runtime failure', new RFCClientError('RFC_ABAP_RUNTIME_FAILURE', null, null, 'RAISE_EXCEPTION')],
        ['REST server error', new Error('Request failed with status code 500')]
    ])('any other read error (%s) is rethrown', async (_, error) => {
        mockFiles({ header: HEADER, data: error });

        await expect(Transport.readBinaryFiles('TSTK900001')).rejects.toBe(error);
    });
});
