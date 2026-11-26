jest.mock('../../../systemConnector', () => ({
    SystemConnector: {
        getDevclass: jest.fn(),
        setPackageSuperpackage: jest.fn(),
        clearPackageSuperpackage: jest.fn()
    }
}));

import { Logger } from 'trm-commons';
import { SystemConnector } from '../../../systemConnector';
import { applySuperpackage } from './superpackage';

const getDevclass = SystemConnector.getDevclass as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined as never);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('applySuperpackage', () => {
    test.each([
        ['no superpackage, none wanted', '', undefined],
        ['no superpackage, empty wanted', undefined, ''],
        ['the wanted superpackage, padded and lowercase', 'ZPARENT   ', 'zparent']
    ])('%s: the package API is not called', async (_label, parentcl, superpackage) => {
        getDevclass.mockResolvedValue({ devclass: 'ZPKG', parentcl });

        await applySuperpackage('ZPKG', superpackage);

        expect(SystemConnector.setPackageSuperpackage).not.toHaveBeenCalled();
        expect(SystemConnector.clearPackageSuperpackage).not.toHaveBeenCalled();
    });

    test('a different superpackage is set', async () => {
        getDevclass.mockResolvedValue({ devclass: 'ZPKG', parentcl: 'ZOLD' });

        await applySuperpackage('ZPKG', 'ZNEW');

        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZPKG', 'ZNEW');
        expect(SystemConnector.clearPackageSuperpackage).not.toHaveBeenCalled();
    });

    test('an existing superpackage is removed', async () => {
        getDevclass.mockResolvedValue({ devclass: 'ZPKG', parentcl: 'ZOLD' });

        await applySuperpackage('ZPKG');

        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZPKG');
        expect(SystemConnector.setPackageSuperpackage).not.toHaveBeenCalled();
    });

    test('a package that is not found is written: the write reports the error', async () => {
        getDevclass.mockResolvedValue(undefined);

        await applySuperpackage('ZPKG');

        expect(SystemConnector.clearPackageSuperpackage).toHaveBeenCalledWith('ZPKG');
    });

    test('a read failure falls back to the write', async () => {
        getDevclass.mockRejectedValue(new Error('read failed'));

        await applySuperpackage('ZPKG', 'ZNEW');

        expect(SystemConnector.setPackageSuperpackage).toHaveBeenCalledWith('ZPKG', 'ZNEW');
    });

    test('a write failure is thrown', async () => {
        getDevclass.mockResolvedValue({ devclass: 'ZPKG', parentcl: 'ZOLD' });
        (SystemConnector.clearPackageSuperpackage as jest.Mock).mockRejectedValue(new Error('dialog'));

        await expect(applySuperpackage('ZPKG')).rejects.toThrow('dialog');
    });
});
