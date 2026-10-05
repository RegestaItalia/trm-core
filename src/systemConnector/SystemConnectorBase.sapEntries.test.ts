import { SystemConnectorBase } from '.';

function connector(readTable: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.readTable = readTable;
    return instance as SystemConnectorBase;
}

describe('SystemConnectorBase checkSapEntryExists', () => {
    test('builds an escaped query', async () => {
        const readTable = jest.fn().mockResolvedValue([{ name: "O'NEIL" }]);
        expect(await connector(readTable).checkSapEntryExists('ztab', { name: "O'NEIL", id: '1' })).toBe(true);
        expect(readTable).toHaveBeenCalledWith('ZTAB', [{ fieldName: 'NAME' }], "NAME EQ 'O''NEIL' AND ID EQ '1'");
    });

    test('throws on invalid entries instead of reporting them missing', async () => {
        const readTable = jest.fn();
        await expect(connector(readTable).checkSapEntryExists('ZTAB', {})).rejects.toThrow(/at least one field/);
        await expect(connector(readTable).checkSapEntryExists('ZTAB', { ID: 'X'.repeat(70) })).rejects.toThrow(/too long/);
        expect(readTable).not.toHaveBeenCalled();
    });

    test('returns false only when no row is read', async () => {
        expect(await connector(jest.fn().mockResolvedValue([])).checkSapEntryExists('ZTAB', { ID: '1' })).toBe(false);
    });

    test('propagates read errors', async () => {
        const readTable = jest.fn().mockRejectedValue(new Error('NOT_AUTHORIZED'));
        await expect(connector(readTable).checkSapEntryExists('ZTAB', { ID: '1' })).rejects.toThrow('NOT_AUTHORIZED');
    });
});
