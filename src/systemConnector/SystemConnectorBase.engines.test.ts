import { SystemConnectorBase } from '.';

function connector(readTable: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.readTable = readTable;
    return instance as SystemConnectorBase;
}

describe('SystemConnectorBase engines reads', () => {
    test('checkTableCondition builds an escaped query and reads at most one row', async () => {
        const readTable = jest.fn().mockResolvedValue([{ clsname: '/UI2/CL_JSON' }]);
        const exists = await connector(readTable).checkTableCondition('seocompodf', [
            { field: 'clsname', value: '/UI2/CL_JSON' },
            { field: 'ATTVALUE', op: 'GE', value: "O'12" }
        ]);
        expect(exists).toBe(true);
        expect(readTable).toHaveBeenCalledWith('SEOCOMPODF', [{ fieldName: 'CLSNAME' }], "CLSNAME EQ '/UI2/CL_JSON' AND ATTVALUE GE 'O''12'", { offset: 0, limit: 1 });
    });

    test('checkTableCondition propagates read errors', async () => {
        const readTable = jest.fn().mockRejectedValue(new Error('TABLE_NOT_AVAILABLE'));
        await expect(connector(readTable).checkTableCondition('ZNOPE', [{ field: 'A', value: 'B' }])).rejects.toThrow('TABLE_NOT_AVAILABLE');
    });

    test('getNoteStatus pads the note number and returns the latest version', async () => {
        const readTable = jest.fn()
            .mockResolvedValueOnce([{ numm: '0003284711', ntstatus: 'A', prstatus: 'E' }])
            .mockResolvedValueOnce([{ numm: '0003284711', versno: '0002' }, { numm: '0003284711', versno: '0010' }, { numm: '0003284711', versno: '0003' }]);
        const status = await connector(readTable).getNoteStatus('3284711');
        expect(readTable.mock.calls[0][2]).toBe("NUMM EQ '0003284711'");
        expect(status).toEqual({ prstatus: 'E', versno: '0010' });
    });

    test('getNoteStatus returns empty status for notes not downloaded', async () => {
        const readTable = jest.fn().mockResolvedValueOnce([]);
        expect(await connector(readTable).getNoteStatus('1')).toEqual({});
        expect(readTable).toHaveBeenCalledTimes(1);
    });

    test('getInstalledProducts reads installed versions only', async () => {
        const readTable = jest.fn().mockResolvedValue([]);
        await connector(readTable).getInstalledProducts();
        expect(readTable.mock.calls[0][0]).toBe('PRDVERS');
        expect(readTable.mock.calls[0][2]).toBe("INSTSTATUS EQ '+'");
    });
});
