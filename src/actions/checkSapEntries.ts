import { SystemConnector } from "../systemConnector";

export type MissingSapEntries = {
    table: string,
    entries: any[]
};

export async function checkSapEntries(sapEntries: any, system: SystemConnector): Promise<{
    missingSapEntries: MissingSapEntries[]
}> {
    var missingSapEntries: MissingSapEntries[] = [];
    for (const sapTable of Object.keys(sapEntries)) {
        for (const sapEntry of sapEntries[sapTable]) {
            const exists = await system.checkSapEntryExists(sapTable, sapEntry);
            if (!exists) {
                var arrayIndex = missingSapEntries.findIndex(o => o.table === sapTable);
                if (arrayIndex < 0) {
                    arrayIndex = missingSapEntries.push({
                        table: sapTable,
                        entries: []
                    });
                    arrayIndex--;
                }
                missingSapEntries[arrayIndex].entries.push(sapEntry);
            }
        }
    }
    return {
        missingSapEntries
    };
}