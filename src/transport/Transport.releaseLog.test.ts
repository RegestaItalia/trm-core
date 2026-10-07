jest.mock('../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'TST'),
        getDirTrans: jest.fn(async () => '/usr/sap/trans'),
        getFileSystem: jest.fn(async () => ({ filesys: 'UNIX' })),
        getR3transVersion: jest.fn(async () => 'R3trans version test'),
        getR3transUnicode: jest.fn(async () => true),
        getBinaryFile: jest.fn()
    }
}));

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from 'trm-commons';
import { SystemConnector } from '../systemConnector';
import { Transport } from './Transport';

const TRKORR = 'TSTK900001';

function step(id: string, name: string, exitCode: string): string {
    return [
        `1 ETP199X######################################`,
        `1 ETP${id} ${name}`,
        `1 ETP101 transport order     : "${TRKORR}"`,
        `1 ETP${id} ${name}`,
        `1 ETP110 end date and time   : "20260101120000"`,
        `1 ETP111 exit code           : "${exitCode}"`,
        `1 ETP199 ######################################`
    ].join('\n');
}

const FULL_LOG = Buffer.from([
    step('182', 'CHECK WRITEABILITY OF BUFFERS', '0'),
    step('183', 'EXPORT PREPARATION', '0'),
    step('150', 'MAIN EXPORT', '0')
].join('\n'));
const PARTIAL_LOG = Buffer.from(step('182', 'CHECK WRITEABILITY OF BUFFERS', '0'));

describe('Transport.readReleaseLog', () => {
    const defaultTimeout = Transport.releaseLogTimeoutMs;
    var baseFolder: string;

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'success', 'log', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        baseFolder = mkdtempSync(join(tmpdir(), 'trm-release-log-'));
    });

    afterEach(() => {
        Transport.releaseLogTimeoutMs = defaultTimeout;
        rmSync(baseFolder, { recursive: true, force: true });
    });

    test('creates a missing temporary folder instead of polling forever', async () => {
        (SystemConnector.getBinaryFile as jest.Mock).mockResolvedValue(FULL_LOG);
        const tmpFolder = join(baseFolder, 'not', 'yet', 'created');

        await expect(new Transport(TRKORR).readReleaseLog(tmpFolder)).resolves.toBe(0);
        expect(existsSync(tmpFolder)).toBe(true);
        expect(SystemConnector.getBinaryFile).toHaveBeenCalledTimes(1);
    });

    test('keeps polling while the log is missing or incomplete', async () => {
        (SystemConnector.getBinaryFile as jest.Mock)
            .mockRejectedValueOnce(new Error('file not found'))
            .mockResolvedValueOnce(PARTIAL_LOG)
            .mockResolvedValue(FULL_LOG);

        await expect(new Transport(TRKORR).readReleaseLog(baseFolder)).resolves.toBe(0);
        expect(SystemConnector.getBinaryFile).toHaveBeenCalledTimes(3);
    }, 10000);

    test('a local file system error fails instead of being read as "log not ready"', async () => {
        (SystemConnector.getBinaryFile as jest.Mock).mockResolvedValue(FULL_LOG);
        const notAFolder = join(baseFolder, 'file');
        writeFileSync(notAFolder, 'x');

        await expect(new Transport(TRKORR).readReleaseLog(notAFolder)).rejects.toThrow();
        expect(SystemConnector.getBinaryFile).not.toHaveBeenCalled();
    });

    test('times out when the log never reports every step', async () => {
        Transport.releaseLogTimeoutMs = 1500;
        (SystemConnector.getBinaryFile as jest.Mock).mockResolvedValue(PARTIAL_LOG);

        await expect(new Transport(TRKORR).readReleaseLog(baseFolder)).rejects.toThrow(`Timed out waiting for transport ${TRKORR} release log`);
    }, 10000);
});
