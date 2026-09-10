jest.mock('../../systemConnector', () => ({
    SystemConnector: { getObjectsLocks: jest.fn() }
}));

jest.mock('../../manifest', () => ({
    Manifest: class MockManifest { getAbapXml() { return '<manifest/>'; } }
}));

jest.mock('../../transport', () => ({
    Transport: class MockTransport {
        static createWb = jest.fn();
    }
}));

import execute from '@simonegaffurini/sammarksworkflow';
import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { Transport } from '../../transport';
import { generateLandscapeTransport } from './generateLandscapeTransport';

function context(keepOriginal = true) {
    return {
        rawInput: {
            installData: {
                installDevclass: {
                    keepOriginal,
                    replacements: [{ originalDevclass: 'ZROOT', installDevclass: 'ZTARGET' }]
                },
                landscapeTransport: { targetSystem: 'QAS' }
            }
        },
        runtime: {
            namespace: 'Z',
            update: { getDevclass: () => 'ZOLD' },
            package: { data: { manifest: { name: 'pkg', version: '1.0.0' } } },
            transports: {
                devc: { instance: { trkorr: 'DEVK9DEVC' } },
                tadir: { instance: { trkorr: 'DEVK9TADIR' } },
                lang: { instance: { trkorr: 'DEVK9LANG' } },
                cust: [
                    { instance: { trkorr: 'DEVK9CUST1' } },
                    { instance: { trkorr: 'DEVK9CUST2' } }
                ]
            }
        },
        revert: { namespace: '/TEST/', dele: { trkorr: 'DEVK9DELE' } },
        output: { transport: undefined }
    } as any;
}

describe('generateLandscapeTransport rollback', () => {
    let landscape: any;
    let failure: { method: string, occurrence: number } | undefined;
    let calls: Record<string, number>;

    const hit = async (method: string) => {
        calls[method] = (calls[method] || 0) + 1;
        if (failure?.method === method && failure.occurrence === calls[method]) {
            throw new Error(`failure at ${method}.${calls[method]}`);
        }
    };

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        failure = undefined;
        calls = {};
        jest.spyOn(Logger, 'loading').mockImplementation(() => undefined as never);
        landscape = {
            addObjectsFromTransport: jest.fn(() => hit('addObjectsFromTransport')),
            addObjects: jest.fn(() => hit('addObjects')),
            removeComments: jest.fn(() => hit('removeComments')),
            addComment: jest.fn(() => hit('addComment')),
            setDocumentation: jest.fn(() => hit('setDocumentation')),
            lock: jest.fn(() => hit('lock')),
            canBeDeleted: jest.fn().mockResolvedValue(true),
            delete: jest.fn().mockResolvedValue(undefined)
        };
        jest.spyOn(Transport, 'createWb').mockResolvedValue(landscape);
        jest.spyOn(SystemConnector, 'getObjectsLocks').mockImplementation(async () => {
            await hit('getObjectsLocks');
            return [];
        });
    });

    async function runFailure(method: string, occurrence = 1, keepOriginal = true) {
        failure = { method, occurrence };
        const ctx = context(keepOriginal);
        await expect(execute('test', [generateLandscapeTransport], ctx)).rejects.toThrow();
        expect(ctx.output.transport).toBeUndefined();
        expect(landscape.canBeDeleted).toHaveBeenCalledTimes(1);
        expect(landscape.delete).toHaveBeenCalledTimes(1);
    }

    test.each([
        ['addObjectsFromTransport', 1],
        ['addObjectsFromTransport', 2],
        ['getObjectsLocks', 1],
        ['addObjects', 1],
        ['addObjectsFromTransport', 3],
        ['addObjectsFromTransport', 4],
        ['addObjectsFromTransport', 5],
        ['removeComments', 1],
        ['addComment', 1],
        ['addComment', 2],
        ['addComment', 3],
        ['setDocumentation', 1],
        ['lock', 1]
    ] as [string, number][])('failure at %s occurrence %s deletes the landscape request', runFailure);

    test('replacement-package branch failure deletes the landscape request', async () => {
        await runFailure('addObjects', 1, false);
    });

    test('failure after landscape generation also deletes the request', async () => {
        const ctx = context();
        const later = { name: 'later', run: async () => { throw new Error('later'); } };

        await expect(execute('test', [generateLandscapeTransport, later], ctx)).rejects.toThrow();

        expect(landscape.delete).toHaveBeenCalledTimes(1);
        expect(ctx.output.transport).toBeUndefined();
    });
});
