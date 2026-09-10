jest.mock('../../transport', () => {
    const created: any[] = [];
    let sequence = 0;
    let fault: { method: string, occurrence: number, seen: number } | undefined;
    const hit = (method: string) => {
        if (fault?.method === method && ++fault.seen === fault.occurrence) {
            throw new Error(`failure at ${method}.${fault.occurrence}`);
        }
    };
    class MockTransport {
        static created = created;
        static createToc = jest.fn(async (data: any) => {
            hit('createToc');
            const transport = new MockTransport(`${data.trmIdentifier}-${++sequence}`);
            transport.trmIdentifier = data.trmIdentifier;
            created.push(transport);
            return transport;
        });
        static setFault(method?: string, occurrence = 1) {
            fault = method ? { method, occurrence, seen: 0 } : undefined;
        }
        static getTransportIcon = jest.fn(() => 'TR');
        trmIdentifier: string;
        released = false;
        constructor(public trkorr: string) {}
        addObjects = jest.fn(async () => { hit('addObjects'); });
        addTranslations = jest.fn(async () => { hit('addTranslations'); });
        getE071 = jest.fn(async () => { hit('getE071'); return [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZOBJ' }]; });
        getTasks = jest.fn(async () => { hit('getTasks'); return [new MockTransport(`${this.trkorr}-TASK`)]; });
        addObjectsFromTransport = jest.fn(async () => { hit('addObjectsFromTransport'); });
        addComment = jest.fn(async () => { hit('addComment'); });
        setDocumentation = jest.fn(async () => { hit('setDocumentation'); });
        release = jest.fn(async () => { hit('release'); this.released = true; });
        canBeDeleted = jest.fn(async () => !this.released);
        delete = jest.fn(async () => undefined);
    }
    return {
        Transport: MockTransport,
        TrmTransportIdentifier: { DEVC: 'DEVC', TADIR: 'TADIR', LANG: 'LANG', CUST: 'CUST' }
    };
});

import execute from '@simonegaffurini/sammarksworkflow';
import { Inquirer, Logger } from 'trm-commons';
import { Transport } from '../../transport';
import { generateDevcTransport } from './generateDevcTransport';
import { generateTadirTransport } from './generateTadirTransport';
import { generateLangTransport } from './generateLangTransport';
import { generateCustTransport } from './generateCustTransport';
import { releaseTransports } from './releaseTransports';

function context() {
    return {
        rawInput: {
            contextData: {},
            systemData: { transportTarget: 'TST' },
            packageData: { name: 'pkg', version: '1.0.0' },
            publishData: { noLanguageTransport: false, noCustomizingTransports: false }
        },
        runtime: {
            stopWarningShown: true,
            manifestXml: '<manifest/>',
            sapPackage: { objects: [
                { pgmid: 'R3TR', object: 'DEVC', objName: 'ZROOT' },
                { pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG' }
            ] },
            customizing: {
                retained: [],
                new: [
                    { trkorr: 'TSTK900010', description: 'First customizing' },
                    { trkorr: 'TSTK900011', description: 'Second customizing' }
                ]
            },
            transports: { devc: undefined, tadir: undefined, lang: undefined, cust: [] },
            aggregatedTransports: []
        }
    } as any;
}

describe('publish transport rollback chain', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        (Transport as any).created.length = 0;
        (Transport as any).setFault();
        for (const method of ['loading', 'log', 'info', 'warning'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        jest.spyOn(Logger, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Logger, 'setPrefix').mockImplementation(() => undefined as never);
        jest.spyOn(Inquirer, 'getPrefix').mockReturnValue(undefined);
        jest.spyOn(Inquirer, 'setPrefix').mockImplementation(() => undefined as never);
    });

    function steps() {
        return [
            generateDevcTransport,
            generateTadirTransport,
            generateLangTransport,
            generateCustTransport,
            releaseTransports
        ];
    }

    async function failAt(method: string, occurrence = 1) {
        const ctx = context();
        (Transport as any).setFault(method, occurrence);

        await expect(execute('publish-test', steps(), ctx)).rejects.toThrow();
        return { ctx, created: [...(Transport as any).created] as any[] };
    }

    test.each([
        ['createToc', 2],
        ['addObjects', 1],
        ['addObjects', 2],
        ['createToc', 3],
        ['getTasks', 1],
        ['createToc', 4],
        ['addObjectsFromTransport', 1],
        ['addObjectsFromTransport', 2],
        ['getE071', 3]
    ] as [string, number][])('failure at %s occurrence %s cleans every deletable generated transport', async (method, occurrence) => {
        const { created } = await failAt(method, occurrence);

        expect(created.length).toBeGreaterThan(0);
        for (const transport of created) {
            expect(transport.canBeDeleted).toHaveBeenCalled();
            if (!transport.released) {
                expect(transport.delete).toHaveBeenCalled();
            }
        }
    });

    test.each([
        ['addComment', 1],
        ['addComment', 4],
        ['setDocumentation', 2],
        ['release', 1],
        ['release', 3]
    ] as [string, number][])('release preparation failure at %s occurrence %s runs all generator reverts', async (method, occurrence) => {
        const { created } = await failAt(method, occurrence);

        for (const transport of created) {
            expect(transport.canBeDeleted).toHaveBeenCalled();
            if (!transport.released) {
                expect(transport.delete).toHaveBeenCalled();
            }
        }
    });

    test('one customizing cleanup failure does not skip the remaining transports', async () => {
        const ctx = context();
        await generateCustTransport.run(ctx);
        const [first, second] = ctx.runtime.transports.cust;
        first.canBeDeleted.mockRejectedValue(new Error('status failed'));

        await expect(generateCustTransport.revert(ctx)).rejects.toThrow('status failed');

        expect(second.canBeDeleted).toHaveBeenCalledTimes(1);
        expect(second.delete).toHaveBeenCalledTimes(1);
    });

    test('release rollback walks every generated request after a later release fails', async () => {
        const ctx = context();
        await generateDevcTransport.run(ctx);
        await generateTadirTransport.run(ctx);
        ctx.runtime.aggregatedTransports = [ctx.runtime.transports.devc, ctx.runtime.transports.tadir];
        ctx.runtime.transports.devc.canBeDeleted.mockResolvedValue(true);
        ctx.runtime.transports.tadir.canBeDeleted.mockRejectedValue(new Error('status failed'));

        await expect(releaseTransports.revert(ctx)).rejects.toThrow('status failed');
        expect(ctx.runtime.transports.devc.delete).toHaveBeenCalledTimes(1);
        expect(ctx.runtime.transports.tadir.canBeDeleted).toHaveBeenCalledTimes(1);
    });
});
