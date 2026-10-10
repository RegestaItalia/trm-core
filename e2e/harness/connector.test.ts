import { createSystemConnector } from './connector';

const env = {
    SAP_URL: 'http://sap:8000', SAP_ASHOST: 'sap', SAP_SYSNR: '00',
    SAP_USER: 'tester', SAP_PASSWORD: 'secret', SAP_CLIENT: '100'
};

function mockCore() {
    return {
        RESTSystemConnector: jest.fn(), RFCSystemConnector: jest.fn(), OpenRFCSystemConnector: jest.fn()
    };
}

test('defaults to REST without requiring RFC settings', () => {
    const core = mockCore();
    createSystemConnector(core, { SAP_URL: env.SAP_URL });
    expect(core.RESTSystemConnector).toHaveBeenCalledWith({ endpoint: env.SAP_URL }, {
        user: undefined, passwd: undefined, client: undefined, lang: 'EN'
    });
    expect(core.RFCSystemConnector).not.toHaveBeenCalled();
    expect(core.OpenRFCSystemConnector).not.toHaveBeenCalled();
});

test.each(['RFC', 'OpenRFC'])('selects %s and forwards RFC configuration', kind => {
    const core = mockCore();
    createSystemConnector(core, {
        ...env, SAP_CONNECTOR: kind, SAP_LANGUAGE: 'IT', SAP_SAPROUTER: '/H/router',
        SAP_RFC_TRACE_DIR: '/tmp/trace', SAP_RFC_MODULES_PATH: '/tmp/modules'
    });
    const args = [
        { ashost: 'sap', sysnr: '00', saprouter: '/H/router' },
        { user: 'tester', passwd: 'secret', client: '100', lang: 'IT' }, '/tmp/trace'
    ];
    if (kind === 'RFC') args.push('/tmp/modules');
    expect(core[kind === 'RFC' ? 'RFCSystemConnector' : 'OpenRFCSystemConnector']).toHaveBeenCalledWith(...args);
    expect(core.RESTSystemConnector).not.toHaveBeenCalled();
});

test('rejects an unknown connector instead of silently using REST', () => {
    expect(() => createSystemConnector(mockCore(), { SAP_CONNECTOR: 'typo' })).toThrow('Unknown SAP_CONNECTOR');
});

test.each(['SAP_ASHOST', 'SAP_SYSNR', 'SAP_USER', 'SAP_PASSWORD', 'SAP_CLIENT'])(
    'rejects missing %s before constructing an RFC connector', key => {
        const core = mockCore();
        expect(() => createSystemConnector(core, { ...env, SAP_CONNECTOR: 'RFC', [key]: '' })).toThrow(`${key} is required`);
        expect(core.RFCSystemConnector).not.toHaveBeenCalled();
    }
);
