import { SystemConnectorBase } from '.';

function connector(readTable: jest.Mock) {
    const instance = Object.create(SystemConnectorBase.prototype);
    instance.readTable = readTable;
    return instance as SystemConnectorBase;
}

const tadir = (object: string, objName: string, devclass = 'ZPKG') => ({ pgmid: 'R3TR', object, objName, devclass, srcsystem: 'DEV', author: 'ME' });

describe('SystemConnectorBase getExistingObjects', () => {
    test('reads objects of the same type in batches and keeps the input order', async () => {
        const names = Array.from({ length: 30 }, (_, i) => `ZCL_${i}`);
        const readTable = jest.fn(async (_table: string, _fields: any[], where: string) => {
            const object = /OBJECT EQ '(\w+)'/.exec(where)[1];
            return [...where.matchAll(/OBJ_NAME EQ '([^']+)'/g)].map(m => m[1]).filter(name => name !== 'ZCL_3').map(name => tadir(object, name));
        });
        const objects = [
            ...names.map(objName => ({ pgmid: 'R3TR', object: 'CLAS', objName, devclass: '' })),
            { pgmid: 'R3TR', object: 'PROG', objName: 'zprog', devclass: '' }
        ];

        const existing = await connector(readTable).getExistingObjects(objects);

        expect(readTable).toHaveBeenCalledTimes(3);
        expect(readTable.mock.calls[0][2]).toBe(`PGMID EQ 'R3TR' AND OBJECT EQ 'CLAS' AND ( ${names.slice(0, 25).map(n => `OBJ_NAME EQ '${n}'`).join(' OR ')} )`);
        expect(existing.map(o => o.objName)).toEqual([...names.filter(n => n !== 'ZCL_3'), 'ZPROG']);
        expect(existing[0]).toEqual(tadir('CLAS', 'ZCL_0'));
    });

    test('names a batch condition line cannot hold are read on their own', async () => {
        const long = `Z${'X'.repeat(59)}`;
        const readTable = jest.fn(async (_table: string, _fields: any[], _where: string) => [tadir('SICF', long)]);

        const existing = await connector(readTable).getExistingObjects([{ pgmid: 'R3TR', object: 'SICF', objName: long, devclass: '' }]);

        expect(readTable).toHaveBeenCalledWith('TADIR', expect.anything(), `PGMID EQ 'R3TR' AND OBJECT EQ 'SICF' AND OBJ_NAME EQ '${long}'`);
        expect(existing).toHaveLength(1);
    });

    test('quotes in names are escaped', async () => {
        const readTable = jest.fn(async (_table: string, _fields: any[], _where: string) => []);

        await connector(readTable).getExistingObjects([{ pgmid: 'R3TR', object: 'PROG', objName: "Z'Q", devclass: '' }]);

        expect(readTable.mock.calls[0][2]).toContain("OBJ_NAME EQ 'Z''Q'");
    });
});
