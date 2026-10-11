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
        getE071KOwner: jest.requireActual('../../transport/E071KOwner').getE071KOwner,
        TrmTransportIdentifier: { DEVC: 'DEVC', TADIR: 'TADIR', LANG: 'LANG', CUST: 'CUST' }
    };
});

jest.mock('trm-commons', () => ({
    Inquirer: { isUi: jest.fn(() => false), prompt: jest.fn() },
    Logger: { loading: jest.fn(), log: jest.fn(), info: jest.fn(), forceStop: jest.fn() }
}));

import { Inquirer } from 'trm-commons';
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
            e071k: [{ pgmid: 'R3TR', object: 'TABU', objname: 'ZTABLE', mastertype: 'TABU', mastername: 'ZTABLE' }]
        });
        const ctx = context(['TESTK900002']);

        await expect(setCustomizingTransports.run(ctx)).resolves.not.toThrow();
        expect(ctx.runtime.customizing.new).toHaveLength(1);
    });

    test('accepts a K transport carrying view maintenance whose keys belong to the view', async () => {
        (Transport as any).configure('TESTK900007', {
            trfunction: 'K',
            e071: [{ pgmid: 'R3TR', object: 'VDAT', objName: 'ZVIEW' }],
            e071k: [{ pgmid: 'R3TR', object: 'TABU', objname: 'ZVIEW_TABLE', mastertype: 'VDAT', mastername: 'ZVIEW' }]
        });
        const ctx = context(['TESTK900007']);

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
            e071k: [{ pgmid: 'R3TR', object: 'TABU', objname: 'ZTABLE', mastertype: 'TABU', mastername: 'ZTABLE' }]
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

describe('interactive customizing transport selection', () => {
    test('rejects adding a retained transport that is already selected', async () => {
        const ctx = context([]);
        ctx.rawInput.contextData.noInquirer = false;
        ctx.runtime.latest.data.transports = [{ trkorr: 'TESTK900010', type: 'CUST', description: 'retained' }];
        let validation: unknown;
        (Inquirer.prompt as jest.Mock).mockReset()
            .mockResolvedValueOnce({ continue: true })
            .mockResolvedValueOnce({ option: 'add' })
            .mockImplementationOnce(async (question: any) => {
                validation = await question.validate('testk900010');
                return { trkorr: '' };
            })
            .mockResolvedValueOnce({ option: 'done' });

        await setCustomizingTransports.run(ctx);

        expect(validation).toBe('Already added');
        expect(ctx.runtime.customizing.retained).toEqual([{ trkorr: 'TESTK900010', description: 'retained' }]);
        expect(ctx.runtime.customizing.new).toHaveLength(0);
    });

    function retainedContext() {
        const ctx = context([]);
        ctx.rawInput.contextData.noInquirer = false;
        ctx.runtime.latest.data.transports = [{ trkorr: 'TESTK900010', type: 'CUST', description: 'retained' }];
        return ctx;
    }
    const retained = { trkorr: 'TESTK900010', description: 'retained' };

    test('keeps a selected retained transport when removal is declined', async () => {
        const ctx = retainedContext();
        let confirm: any;
        (Inquirer.prompt as jest.Mock).mockReset()
            .mockResolvedValueOnce({ continue: true })
            .mockResolvedValueOnce({ option: retained })
            .mockImplementationOnce(async (question: any) => {
                confirm = question;
                return { remove: false };
            })
            .mockResolvedValueOnce({ option: 'done' });

        await setCustomizingTransports.run(ctx);

        expect(confirm.type).toBe('confirm');
        expect(confirm.default).toBe(false);
        expect(confirm.message).toContain('TESTK900010');
        expect(ctx.runtime.customizing.retained).toEqual([retained]);
    });

    test('removes a selected retained transport when removal is confirmed', async () => {
        const ctx = retainedContext();
        (Inquirer.prompt as jest.Mock).mockReset()
            .mockResolvedValueOnce({ continue: true })
            .mockResolvedValueOnce({ option: retained })
            .mockResolvedValueOnce({ remove: true })
            .mockResolvedValueOnce({ option: 'done' });

        await setCustomizingTransports.run(ctx);

        expect(ctx.runtime.customizing.retained).toHaveLength(0);
        expect(ctx.runtime.customizing.new).toHaveLength(0);
    });

    test('removes a selected new transport without confirmation', async () => {
        (Transport as any).configure('TESTK900011', {
            trfunction: 'W',
            e071: [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZTABLE' }],
            e071k: []
        });
        const ctx = context(['TESTK900011']);
        ctx.rawInput.contextData.noInquirer = false;
        (Inquirer.prompt as jest.Mock).mockReset()
            .mockResolvedValueOnce({ continue: true })
            .mockResolvedValueOnce({ option: { trkorr: 'TESTK900011', description: 'description' } })
            .mockResolvedValueOnce({ option: 'done' });

        await setCustomizingTransports.run(ctx);

        expect(Inquirer.prompt).toHaveBeenCalledTimes(3);
        expect(ctx.runtime.customizing.new).toHaveLength(0);
    });
});

describe('dropping carried-over customizing transports', () => {
    const latest = [
        { trkorr: 'TESTK900020', type: 'CUST', description: 'first' },
        { trkorr: 'TESTK900021', type: 'CUST', description: 'second' },
        { trkorr: 'TESTK900022', type: 'TADIR', description: 'objects' }
    ];
    function dropContext(drop: string[], customizingTransports: string[] = []) {
        const ctx = context(customizingTransports);
        ctx.rawInput.publishData.dropCustomizingTransports = drop;
        ctx.runtime.latest.data.transports = latest;
        return ctx;
    }

    beforeEach(() => {
        (Transport as any).reset();
        (Inquirer.prompt as jest.Mock).mockReset();
    });

    test('drops the listed retained transports without prompting (case-insensitive)', async () => {
        const ctx = dropContext([' testk900020 ']);

        await setCustomizingTransports.run(ctx);

        expect(ctx.runtime.customizing.retained).toEqual([{ trkorr: 'TESTK900021', description: 'second' }]);
        expect(ctx.rawInput.publishData.customizingTransports).toEqual(['TESTK900021']);
        expect(Inquirer.prompt).not.toHaveBeenCalled();
    });

    test('"all" drops every retained transport and keeps new ones', async () => {
        (Transport as any).configure('TESTK900030', {
            trfunction: 'W',
            e071: [{ pgmid: 'R3TR', object: 'TABU', objName: 'ZTABLE' }],
            e071k: []
        });
        const ctx = dropContext(['all'], ['TESTK900030']);

        await setCustomizingTransports.run(ctx);

        expect(ctx.runtime.customizing.retained).toHaveLength(0);
        expect(ctx.runtime.customizing.new).toEqual([{ trkorr: 'TESTK900030', description: 'description' }]);
    });

    test('rejects "all" combined with transport requests', async () => {
        await expect(setCustomizingTransports.run(dropContext(['all', 'TESTK900020']))).rejects.toThrow(/cannot be combined/);
    });

    test('rejects an identifier that is not a carried-over customizing transport', async () => {
        const ctx = dropContext(['TESTK900020', 'TESTK900099']);

        await expect(setCustomizingTransports.run(ctx)).rejects.toThrow(/Cannot drop TESTK900099: not a customizing transport of the latest release \(carried over: TESTK900020, TESTK900021\)/);
        expect(ctx.runtime.customizing.retained).toHaveLength(0);
    });

    test('rejects a non-customizing transport of the latest release', async () => {
        await expect(setCustomizingTransports.run(dropContext(['TESTK900022']))).rejects.toThrow(/Cannot drop TESTK900022/);
    });

    test('rejects dropping when there is no latest release', async () => {
        const ctx = context([]);
        ctx.rawInput.publishData.dropCustomizingTransports = ['TESTK900020'];
        ctx.runtime.latest.data = undefined;

        await expect(setCustomizingTransports.run(ctx)).rejects.toThrow(/none carried over/);
    });

    test('rejects a transport both added and dropped', async () => {
        await expect(setCustomizingTransports.run(dropContext(['TESTK900020'], ['testk900020']))).rejects.toThrow(/Cannot both add and drop customizing transport TESTK900020/);
    });

    test('interactive selection starts without the dropped transports', async () => {
        const ctx = dropContext(['TESTK900020']);
        ctx.rawInput.contextData.noInquirer = false;
        let choices: any[] = [];
        (Inquirer.prompt as jest.Mock)
            .mockResolvedValueOnce({ continue: true })
            .mockImplementationOnce(async (question: any) => {
                choices = question.choices;
                return { option: 'done' };
            });

        await setCustomizingTransports.run(ctx);

        expect(choices.map(c => c.value)).toEqual([{ trkorr: 'TESTK900021', description: 'second' }, 'add', 'done']);
        expect(ctx.runtime.customizing.retained).toEqual([{ trkorr: 'TESTK900021', description: 'second' }]);
    });
});
