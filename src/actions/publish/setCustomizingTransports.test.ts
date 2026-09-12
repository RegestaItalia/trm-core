jest.mock('../../transport', () => {
    type Config = { trfunction: string, e071: any[], e071k: any[], tasks?: string[] };
    const config = new Map<string, Config>();
    class MockTransport {
        static getTransportIcon = jest.fn(() => 'TR');
        static configure(trkorr: string, cfg: Config) {
            config.set(trkorr, cfg);
        }
        static reset() {
            config.clear();
        }
        constructor(public trkorr: string) { }
        getE070 = jest.fn(async () => ({ trfunction: config.get(this.trkorr)?.trfunction ?? 'W' }));
        getTasks = jest.fn(async () => (config.get(this.trkorr)?.tasks ?? []).map(t => new MockTransport(t)));
        getE071 = jest.fn(async () => config.get(this.trkorr)?.e071 ?? []);
        getE071K = jest.fn(async () => config.get(this.trkorr)?.e071k ?? []);
        getDescription = jest.fn(async () => 'description');
    }
    return {
        Transport: MockTransport,
        TrmTransportIdentifier: { DEVC: 'DEVC', TADIR: 'TADIR', LANG: 'LANG', CUST: 'CUST' }
    };
});

import { setCustomizingTransports } from './setCustomizingTransports';
import { Transport } from '../../transport';

function context(customizingTransports: string[]) {
    return {
        rawInput: {
            contextData: { noInquirer: true },
            publishData: { noCustomizingTransports: false, customizingTransports }
        },
        runtime: {
            latest: { data: { transports: [] } },
            customizing: { retained: [], new: [] }
        }
    } as any;
}

describe('validateCustomizingTransport (via setCustomizingTransports step)', () => {
    beforeEach(() => {
        (Transport as any).reset();
    });

    test('accepts a W (customizing) transport regardless of E071K', async () => {
        (Transport as any).configure('TESTK900001', {
            trfunction: 'W',
            e071: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG' }],
            e071k: []
        });
        const ctx = context(['TESTK900001']);

        await expect(setCustomizingTransports.run(ctx)).resolves.not.toThrow();
        expect(ctx.runtime.customizing.new).toHaveLength(1);
    });

    test('accepts a K transport whose entries are all table content (matching E071K)', async () => {
        (Transport as any).configure('TESTK900002', {
            trfunction: 'K',
            e071: [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZTABLE' }],
            e071k: [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZTABLE' }]
        });
        const ctx = context(['TESTK900002']);

        await expect(setCustomizingTransports.run(ctx)).resolves.not.toThrow();
        expect(ctx.runtime.customizing.new).toHaveLength(1);
    });

    test('rejects a K transport containing a real object without a matching E071K entry', async () => {
        (Transport as any).configure('TESTK900003', {
            trfunction: 'K',
            e071: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG' }],
            e071k: []
        });
        const ctx = context(['TESTK900003']);

        await expect(setCustomizingTransports.run(ctx)).rejects.toThrow(/not table content/);
    });

    test('ignores TRM comment entries (pgmid *) when checking for table content', async () => {
        (Transport as any).configure('TESTK900004', {
            trfunction: 'K',
            e071: [
                { pgmid: '*', object: 'ZTRM', objName: 'name=pkg' },
                { pgmid: 'R3TR', object: 'TABU', objName: 'ZTABLE' }
            ],
            e071k: [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZTABLE' }]
        });
        const ctx = context(['TESTK900004']);

        await expect(setCustomizingTransports.run(ctx)).resolves.not.toThrow();
    });

    test('checks tasks in addition to the parent request', async () => {
        (Transport as any).configure('TESTK900005', {
            trfunction: 'K',
            e071: [],
            e071k: [],
            tasks: ['TESTK900005-T1']
        });
        (Transport as any).configure('TESTK900005-T1', {
            trfunction: 'K',
            e071: [{ pgmid: 'R3TR', object: 'PROG', objName: 'ZPROG' }],
            e071k: []
        });
        const ctx = context(['TESTK900005']);

        await expect(setCustomizingTransports.run(ctx)).rejects.toThrow(/not table content/);
    });

    test('rejects an empty transport', async () => {
        (Transport as any).configure('TESTK900006', { trfunction: 'W', e071: [], e071k: [] });
        const ctx = context(['TESTK900006']);

        await expect(setCustomizingTransports.run(ctx)).rejects.toThrow(/empty/);
    });
});
