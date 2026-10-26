import { Logger } from 'trm-commons';
import { ClientError } from '../../../client';
import { addManualStep, isPackageApiUnsupported } from './packageApiFallback';

beforeEach(() => {
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('isPackageApiUnsupported', () => {
    test.each([
        ['a parameter the release does not have', 'DYN_CALL_PARAM_NOT_FOUND', { class: 'ZTRM', no: '001' }, '/ATRM/CREATE_PACKAGE'],
        ['a dialog sent in background', 'DYNPRO_SEND_IN_BACKGROUND', { class: '00', no: '341' }, '/ATRM/TDEVC_INTERFACE'],
        ['an exception without a message (RFC)', 'TRM_RFC_EXCEPTION', { class: '', no: '000' }, '/ATRM/CREATE_PACKAGE'],
        ['an exception without a message (REST)', 'Request failed with status code 500', { class: undefined, no: undefined }, '/create_package']
    ])('%s', (_label, exceptionType, sapMessage, resource) => {
        expect(isPackageApiUnsupported(new ClientError(exceptionType, sapMessage as any, 'failed', resource))).toBe(true);
    });

    test('a dump in the HTTP handler of a REST package API call', () => {
        const error = Object.assign(new Error('Request failed with status code 500'), {
            config: { url: '/tdevc_interface' },
            response: { data: '<html>Runtime error DYNPRO_SEND_IN_BACKGROUND</html>' }
        });

        expect(isPackageApiUnsupported(error)).toBe(true);
    });

    test.each([
        ['an error with a message', new ClientError('TRM_RFC_EXCEPTION', { class: 'PAK', no: '012' }, 'No authorization', '/ATRM/CREATE_PACKAGE')],
        ['an unauthorized call', new ClientError('TRM_RFC_UNAUTHORIZED', { class: '', no: '000' }, 'Unauthorized', '/ATRM/CREATE_PACKAGE')],
        ['a connection error', new ClientError('ZNO_CONN', null, 'Connection lost', '/ATRM/CREATE_PACKAGE')],
        ['another API without a message', new ClientError('TRM_RFC_EXCEPTION', { class: '', no: '000' }, 'failed', '/ATRM/TADIR_INTERFACE')],
        ['a plain error', new Error('DYN_CALL_PARAM_NOT_FOUND')]
    ])('%s is a real error', (_label, error) => {
        expect(isPackageApiUnsupported(error)).toBe(false);
    });
});

describe('addManualStep', () => {
    test('records each step once', () => {
        const context: any = { runtime: {} };

        addManualStep(context, 'Create package ZPKG in SE21.');
        addManualStep(context, 'Create package ZPKG in SE21.');

        expect(context.runtime.manualSteps).toEqual(['Create package ZPKG in SE21.']);
    });
});
