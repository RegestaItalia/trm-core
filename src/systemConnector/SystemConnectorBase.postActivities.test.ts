import { SystemConnectorBase } from '.';

function connector(readTable: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.readTable = readTable;
    instance.getLangu = () => 'E';
    return instance as SystemConnectorBase;
}

describe('SystemConnectorBase post activity value help', () => {
    test('includes mandatory importing parameters and their defaults with each class', async () => {
        const readTable = jest.fn()
            .mockResolvedValueOnce([{ clsname: 'ZCL_PA' }, { clsname: 'ZCL_EMPTY' }])
            .mockResolvedValueOnce([{ clsname: 'ZCL_PA', descript: 'Post activity' }])
            .mockResolvedValueOnce([
                { clsname: 'ZCL_PA', sconame: 'IV_REQUIRED', parvalue: '' },
                { clsname: 'ZCL_PA', sconame: 'IV_DEFAULTED', parvalue: 'DEFAULT' }
            ]);

        await expect(connector(readTable).getPostActivities({ offset: 0, limit: 10 })).resolves.toEqual({
            rows: [
                {
                    name: 'ZCL_PA',
                    description: 'Post activity',
                    parameters: [
                        { name: 'IV_REQUIRED' },
                        { name: 'IV_DEFAULTED', value: 'DEFAULT' }
                    ]
                },
                { name: 'ZCL_EMPTY', description: undefined }
            ],
            hasMore: false
        });

        expect(readTable).toHaveBeenNthCalledWith(3, 'SEOSUBCODF', [
            { fieldName: 'CLSNAME' },
            { fieldName: 'SCONAME' },
            { fieldName: 'PARVALUE' }
        ], "CMPNAME EQ 'EXECUTE' AND PARDECLTYP EQ '0' AND PAROPTIONL EQ '' AND VERSION EQ '1' AND ( CLSNAME EQ 'ZCL_PA' OR CLSNAME EQ 'ZCL_EMPTY' )");
    });
});
