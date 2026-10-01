jest.mock('../../systemConnector', () => ({
    SystemConnector: {
        getSoftwareComponents: jest.fn(),
        getInstalledProducts: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../systemConnector';
import { validateEngines } from '../../manifest';
import { ENGINES_TEMPLATE, getSystemEngines } from './getSystemEngines';

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
});
