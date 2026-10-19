jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getDest: jest.fn(() => 'DEV'),
        getDevclass: jest.fn(),
        getTransportLayers: jest.fn(),
        getDefaultTransportLayer: jest.fn()
    }
}));

import { Inquirer, Logger } from 'trm-commons';
import { RFCClientError } from '../../client';
import { SystemConnector } from '../../systemConnector';
import { setTransportLayer } from './setTransportLayer';

function context(options: { target?: string, keepOriginal?: boolean, transportLayer?: string, noInquirer?: boolean } = {}) {
    return {
        rawInput: {
            contextData: { noInquirer: options.noInquirer ?? false },
            installData: {
                landscapeTransport: { targetSystem: 'target' in options ? options.target : 'QAS' },
                installDevclass: {
                    keepOriginal: options.keepOriginal ?? false,
                    transportLayer: options.transportLayer,
                    replacements: [
                        { originalDevclass: 'ZORIG', installDevclass: 'ZNEW' },
                        { originalDevclass: 'ZORIG_SUB', installDevclass: 'ZNEW_SUB' }
                    ]
                }
            }
        },
        runtime: {
            package: { hierarchy: { devclass: 'ZORIG', sub: [{ devclass: 'ZORIG_SUB', sub: [] }] } }
        }
    } as any;
}

describe('set-transport-layer', () => {
    let prompt: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        for (const method of ['loading', 'log', 'info'] as const) {
            jest.spyOn(Logger, method).mockImplementation(() => undefined as never);
        }
        prompt = jest.spyOn(Inquirer, 'prompt').mockResolvedValue({ transportLayer: 'ZQAS' } as any);
        (SystemConnector.getDevclass as jest.Mock).mockResolvedValue(undefined);
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['ZQAS']);
        (SystemConnector.getDefaultTransportLayer as jest.Mock).mockResolvedValue('ZDEF');
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('the only layer routed to the target is set without asking', async () => {
        const ctx = context();
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getTransportLayers).toHaveBeenCalledWith('QAS');
        expect(SystemConnector.getTransportLayers).toHaveBeenCalledTimes(1);
        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBe('ZQAS');
        expect(ctx.rawInput.installData.installDevclass.transportLayer).toBeUndefined();
    });

    test('several routed layers are asked, the routed system default first', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['SAP', 'ZDEF', 'ZQAS']);
        const ctx = context();
        await setTransportLayer.run(ctx);

        expect(prompt).toHaveBeenCalledTimes(1);
        expect(prompt.mock.calls[0][0].choices.map((o: any) => o.value)).toEqual(['ZDEF', 'SAP', 'ZQAS']);
        expect(prompt.mock.calls[0][0].choices[0].name).toBe('ZDEF (default)');
        expect(ctx.runtime.transportLayer).toBe('ZQAS');
    });

    test('a system default that does not route to the target is not offered as default', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['SAP', 'ZQAS']);
        await setTransportLayer.run(context());

        expect(prompt.mock.calls[0][0].choices).toEqual([{ name: 'SAP', value: 'SAP' }, { name: 'ZQAS', value: 'ZQAS' }]);
    });

    test('without prompts, several routed layers use the routed system default', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['ZDEF', 'ZQAS']);
        const ctx = context({ noInquirer: true });
        await setTransportLayer.run(ctx);

        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBe('ZDEF');
    });

    test('without prompts, several routed layers and a default routed elsewhere fail', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['SAP', 'ZQAS']);

        await expect(setTransportLayer.run(context({ noInquirer: true }))).rejects.toThrow('Transport layer was not declared: use one of SAP, ZQAS (routed to QAS).');
    });

    test('the input layer is used when it routes to the target', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['SAP', 'ZQAS']);
        const ctx = context({ transportLayer: 'zqas ' });
        await setTransportLayer.run(ctx);

        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBe('ZQAS');
    });

    test('the input layer fails when it does not route to the target', async () => {
        await expect(setTransportLayer.run(context({ transportLayer: 'ZPRD' }))).rejects.toThrow('Transport layer ZPRD doesn\'t route to QAS, use one of: ZQAS.');
    });

    test('no route to the target fails before anything is changed', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue([]);

        await expect(setTransportLayer.run(context())).rejects.toThrow('No consolidation route from DEV to QAS: configure one in STMS or choose another target.');
    });

    test('an existing package whose layer does not route to the target fails', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === 'ZNEW' ? { devclass, pdevclass: 'ZPRD' } : undefined);

        await expect(setTransportLayer.run(context())).rejects.toThrow('ABAP package ZNEW has transport layer ZPRD, which doesn\'t route to QAS. Change its transport layer (SE21) or choose another target.');
    });

    test('existing packages with a routed layer need no layer and nothing is asked', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockResolvedValue(['SAP', 'ZQAS']);
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) => ({ devclass, pdevclass: 'ZQAS' }));
        const ctx = context();
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getTransportLayers).toHaveBeenCalledTimes(1);
        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBeUndefined();
    });

    test('original packages already on the system without a layer get one', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) => ({ devclass, pdevclass: '' }));
        const ctx = context({ keepOriginal: true });
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getDevclass).toHaveBeenCalledWith('ZORIG');
        expect(SystemConnector.getDevclass).toHaveBeenCalledWith('ZORIG_SUB');
        expect(ctx.runtime.transportLayer).toBe('ZQAS');
    });

    test('original packages get the input layer instead of theirs, so their layer is not checked', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) => ({ devclass, pdevclass: 'ZPRD' }));
        const ctx = context({ keepOriginal: true, transportLayer: 'ZQAS' });
        await setTransportLayer.run(ctx);

        expect(ctx.runtime.transportLayer).toBe('ZQAS');
    });

    test('local packages need no layer', async () => {
        const ctx = context();
        ctx.rawInput.installData.installDevclass.replacements = [
            { originalDevclass: 'ZORIG', installDevclass: '$NEW' },
            { originalDevclass: 'ZORIG_SUB', installDevclass: '$NEW_SUB' }
        ];
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getDevclass).not.toHaveBeenCalled();
        expect(SystemConnector.getTransportLayers).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBeUndefined();
    });

    test('without a landscape target the system default is used, unchecked', async () => {
        const ctx = context({ target: undefined });
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getTransportLayers).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBe('ZDEF');
    });

    test('without a landscape target the input layer is used, unchecked', async () => {
        const ctx = context({ target: undefined, transportLayer: 'ZIN' });
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getDefaultTransportLayer).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBe('ZIN');
    });

    test('a trm-server/trm-rest upgrade on a backend without the routes API continues like before: system default, no checks', async () => {
        (SystemConnector.getDevclass as jest.Mock).mockImplementation(async (devclass: string) =>
            devclass === 'ZNEW' ? { devclass, pdevclass: 'ZPRD' } : undefined);
        const ctx = context();
        ctx.missingBackendApis = ['trmServer8'];
        await setTransportLayer.run(ctx);

        expect(SystemConnector.getTransportLayers).not.toHaveBeenCalled();
        expect(prompt).not.toHaveBeenCalled();
        expect(ctx.runtime.transportLayer).toBe('ZDEF');
    });

    test('a missing routes API is an error outside a trm-server/trm-rest upgrade', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockRejectedValue(new RFCClientError('FU_NOT_FOUND', null, null, 'Function module /ATRM/GET_TRANSPORT_LAYERS not found'));

        await expect(setTransportLayer.run(context())).rejects.toThrow('Function module /ATRM/GET_TRANSPORT_LAYERS not found');
    });

    test('other failures reading the routes are not hidden', async () => {
        (SystemConnector.getTransportLayers as jest.Mock).mockRejectedValue(new RFCClientError('GENERIC', null, null, 'tms down'));

        await expect(setTransportLayer.run(context())).rejects.toThrow('tms down');
    });
});
