jest.mock('../../commons/getNodePackage', () => ({
    getNodePackage: jest.fn(() => ({ version: '9.4.0' }))
}));
jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getSoftwareComponents: jest.fn(),
        getInstalledProducts: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { validateEngines } from '../../manifest';
import { getNodePackage } from '../../commons/getNodePackage';
import { ENGINES_TEMPLATE, getSystemEngines, withTrmEngines } from './getSystemEngines';

const connector = SystemConnector as unknown as {
    getSoftwareComponents: jest.Mock,
    getInstalledProducts: jest.Mock
};

//rows as read from the dev system (CVERS, PRDVERS installed versions)
const CVERS = [
    { component: 'DMIS', release: '2020', extrelease: '0000000008', compType: 'I' },
    { component: 'HOME', release: 'DEV', extrelease: '0000', compType: 'M' },
    { component: 'LOCAL', release: 'DEV', extrelease: '0000', compType: 'L' },
    { component: 'SAP_ABA', release: '75I', extrelease: '0000000002', compType: 'S' },
    { component: 'SAP_BASIS', release: '758', extrelease: '0000000002', compType: 'S' },
    { component: 'ST-PI', release: '740', extrelease: '0000000028', compType: 'X' },
    { component: 'UIBAS001', release: '758', extrelease: '0002', compType: 'W' },
    { component: 'ZCUSTOM_DEVELOPMENT', release: 'DEV', extrelease: '0000000000', compType: 'K' },
    { component: 'ZLOCAL', release: 'DEV', extrelease: '0000000000', compType: 'J' }
];
const PRDVERS = [
    { id: '1', name: 'ABAP PLATFORM', version: '2023', vendor: 'sap.com', descript: '', inststatus: '+' },
    { id: '2', name: 'SAP FIORI FES FOR S/4HANA', version: '2023', vendor: 'sap.com', descript: '', inststatus: '+' },
    { id: '3', name: 'SLT FOR S/4HANA', version: '1.0', vendor: 'sap.com', descript: '', inststatus: '+' },
    { id: '4', name: 'ABAP PLATFORM', version: '2022', vendor: 'sap.com', descript: '', inststatus: '+' }
];

describe('getSystemEngines', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
        ['error', 'warning'].forEach(m => jest.spyOn(Logger, m as any).mockImplementation(() => undefined as never));
        connector.getSoftwareComponents.mockResolvedValue(CVERS);
        connector.getInstalledProducts.mockResolvedValue(PRDVERS);
    });

    test('prefills SAP components (this sp or newer) and products (this version or newer)', async () => {
        const engines = await getSystemEngines();
        expect(engines).toEqual({
            components: {
                DMIS: [{ release: '2020', sp: '>=8' }, { release: '>2020' }],
                SAP_ABA: [{ release: '75I', sp: '>=2' }, { release: '>75I' }],
                SAP_BASIS: [{ release: '758', sp: '>=2' }, { release: '>758' }],
                'ST-PI': [{ release: '740', sp: '>=28' }, { release: '>740' }],
                UIBAS001: [{ release: '758', sp: '>=2' }, { release: '>758' }]
            },
            products: {
                'ABAP PLATFORM': { version: '>=2023' },
                'SAP FIORI FES FOR S/4HANA': { version: '>=2023' },
                'SLT FOR S/4HANA': { version: '>=1.0' }
            }
        });
    });

    test('the prefilled engines are valid (strict)', async () => {
        expect(validateEngines(await getSystemEngines(), { strict: true })).toEqual([]);
    });

    test('read failures fall back to the template', async () => {
        connector.getSoftwareComponents.mockRejectedValue(new Error('not authorized'));
        expect(await getSystemEngines()).toBe(ENGINES_TEMPLATE);
        expect(Logger.warning).toHaveBeenCalled();
    });

    test('nothing to prefill falls back to the template', async () => {
        connector.getSoftwareComponents.mockResolvedValue([]);
        connector.getInstalledProducts.mockResolvedValue([]);
        expect(await getSystemEngines()).toBe(ENGINES_TEMPLATE);
    });

    test('a malformed row is skipped without discarding the rest of the prefill', async () => {
        connector.getSoftwareComponents.mockResolvedValue([{ component: null, release: '758', extrelease: '0002', compType: 'S' }, ...CVERS]);
        connector.getInstalledProducts.mockResolvedValue([{ id: '0', name: undefined, version: '2023' }, ...PRDVERS]);
        const engines = await getSystemEngines();
        expect(engines).not.toBe(ENGINES_TEMPLATE);
        expect(Object.keys(engines.components)).toEqual(['DMIS', 'SAP_ABA', 'SAP_BASIS', 'ST-PI', 'UIBAS001']);
        expect(Object.keys(engines.products)).toEqual(['ABAP PLATFORM', 'SAP FIORI FES FOR S/4HANA', 'SLT FOR S/4HANA']);
    });
});

describe('withTrmEngines', () => {
    beforeEach(() => {
        jest.spyOn(Logger, 'warning').mockImplementation(() => undefined as never);
        (getNodePackage as jest.Mock).mockClear().mockImplementation(() => ({ version: '9.4.0' }));
    });

    test('prefills trm-core with the version in use or newer, first', () => {
        const engines = withTrmEngines({ components: { SAP_BASIS: true } });
        expect(engines).toEqual({ trm: { 'trm-core': '>=9.4.0' }, components: { SAP_BASIS: true } });
        expect(Object.keys(engines)[0]).toBe('trm');
        expect(validateEngines(engines, { strict: true })).toEqual([]);
    });

    test('the version supplied by the client takes precedence', () => {
        expect(withTrmEngines({}, '10.0.1')).toEqual({ trm: { 'trm-core': '>=10.0.1' } });
        expect(getNodePackage).not.toHaveBeenCalled();
    });

    test('other trm packages are kept, the template is not changed', () => {
        expect(withTrmEngines({ trm: { 'trm-server': '>=6.0.0' } })).toEqual({ trm: { 'trm-server': '>=6.0.0', 'trm-core': '>=9.4.0' } });
        const engines = withTrmEngines(ENGINES_TEMPLATE);
        expect(engines.components).toBe(ENGINES_TEMPLATE.components);
        expect(ENGINES_TEMPLATE).not.toHaveProperty('trm');
    });

    test('an unknown trm-core version is not prefilled', () => {
        (getNodePackage as jest.Mock).mockImplementation(() => { throw new Error('not found'); });
        const engines = { components: { SAP_BASIS: true } };
        expect(withTrmEngines(engines)).toBe(engines);
    });
});
