import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckSapEntriesWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { getSapEntryConditions } from "../../manifest";
import { normalize } from "../../commons";

/** Entries read with one query. */
export const SAP_ENTRIES_BATCH_SIZE = 25;
// RFC_READ_TABLE option lines hold 72 characters: a batched condition also carries "OR ( " and " )"
const BATCHED_CONDITION_MAX_LENGTH = 65;

function entryError(table: string, tableEntry: any, e: unknown): Error {
    const reason = e instanceof Error ? e.message : String(e);
    return new Error(`Unable to check required SAP entry ${JSON.stringify(tableEntry)} in table "${table}": ${reason}`);
}

async function checkEntry(table: string, tableEntry: any): Promise<boolean> {
    try {
        return await SystemConnector.checkSapEntryExists(table, tableEntry);
    } catch (e) {
        throw entryError(table, tableEntry, e);
    }
}

/**
 * Whether each entry of a table exists. Entries with the same fields are read together, in batches of
 * {@link SAP_ENTRIES_BATCH_SIZE}; an entry a batch doesn't return is checked on its own, as are the entries
 * of a batch that can't be read (e.g. rows too wide).
 */
async function checkTableEntries(table: string, entries: any[], onChecked: (count: number) => void): Promise<boolean[]> {
    const status: boolean[] = new Array(entries.length);
    const batches = new Map<string, { index: number, values: Map<string, string>, conditions: string[] }[]>();
    const singles: number[] = [];
    entries.forEach((tableEntry, index) => {
        let conditions: string[];
        try {
            conditions = getSapEntryConditions(tableEntry);
        } catch (e) {
            throw entryError(table, tableEntry, e);
        }
        if (conditions.some(condition => condition.length > BATCHED_CONDITION_MAX_LENGTH)) {
            singles.push(index);
            return;
        }
        const values = new Map(Object.keys(tableEntry).map(field => [field.trim().toUpperCase(), tableEntry[field].toString()]));
        const fieldsKey = Array.from(values.keys()).sort().join(',');
        if (!batches.has(fieldsKey)) {
            batches.set(fieldsKey, []);
        }
        batches.get(fieldsKey).push({ index, values, conditions });
    });

    for (const [fieldsKey, group] of batches) {
        const fields = fieldsKey.split(',');
        // readTable returns camel-cased field names
        const rowKeys = fields.map(field => Object.keys(normalize({ [field]: '' }))[0]);
        for (let i = 0; i < group.length; i += SAP_ENTRIES_BATCH_SIZE) {
            const batch = group.slice(i, i + SAP_ENTRIES_BATCH_SIZE);
            let rows: any[];
            try {
                rows = await SystemConnector.readTable(table.trim().toUpperCase(),
                    fields.map(fieldName => ({ fieldName })),
                    batch.map(o => `( ${o.conditions.join(' AND ')} )`).join(' OR '));
            } catch (e) {
                Logger.log(`Batch read of ${batch.length} entries in ${table} failed, checking them one by one: ${e}`, true);
                singles.push(...batch.map(o => o.index));
                continue;
            }
            for (const o of batch) {
                const found = rows.some(row => fields.every((field, f) => `${row[rowKeys[f]] ?? ''}`.trim() === o.values.get(field).trim()));
                if (found) {
                    status[o.index] = true;
                } else {
                    // values the database matches but that read differently (e.g. numbers) are confirmed on their own
                    singles.push(o.index);
                }
            }
            onChecked(batch.length - batch.filter(o => !status[o.index]).length);
        }
    }

    for (const index of singles) {
        status[index] = await checkEntry(table, entries[index]);
        onChecked(1);
    }
    return status;
}

/**
 * Workflow step that queries required SAP tables and builds a per-entry status report.
 *
 * 1- build required tables fields
 *
 * 2- check entries
 *
 * 3- print tables
 *
 * 4- build output data
 *
*/
export const analyze: Step<CheckSapEntriesWorkflowContext> = {
    name: 'analyze',
    filter: async (context: CheckSapEntriesWorkflowContext): Promise<boolean> => {
        if (Object.keys(context.output.sapEntries).length > 0) {
            return true;
        } else {
            Logger.info(`Package ${context.rawInput.packageData.manifest.name} has no SAP entries`, !context.rawInput.printOptions.information);
            return false;
        }
    },
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        var logTable: {
            header: any,
            data: any
        }[] = [];

        //1- build required tables fields
        var entriesCount = 0;
        var tableFields: {
            tableName: string,
            fields: string[]
        }[] = [];
        Object.keys(context.output.sapEntries).forEach(tableName => {
            var aFields: string[] = [];
            context.output.sapEntries[tableName].forEach(o => {
                entriesCount++;
                Object.keys(o).forEach(field => {
                    if(!aFields.includes(field)){
                        aFields.push(field);
                    }
                });
            });
            tableFields.push({
                tableName,
                fields: aFields
            });
        });

        Logger.info(`Package ${context.rawInput.packageData.manifest.name} has ${entriesCount} SAP entries`, !context.rawInput.printOptions.information);
        if(entriesCount === 0){
            return;
        }

        //2- check entries
        let checked = 0;
        const progress = (table: string) => Logger.loading(`Checking ${entriesCount} SAP entries: ${Math.floor(checked * 100 / entriesCount)}% (${table.trim()})...`);
        for (const table of Object.keys(context.output.sapEntries)) {
            const requiredEntries: any[] = context.output.sapEntries[table];
            progress(table);
            var tableExists = false;
            try {
                for (const object of ['TABL', 'VIEW']) {
                    tableExists = await SystemConnector.checkSapEntryExists('TADIR', {
                        pgmid: 'R3TR',
                        object,
                        obj_name: table.trim().toUpperCase()
                    });
                    if (tableExists) {
                        break;
                    }
                }
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                throw new Error(`Unable to check whether required SAP table "${table}" exists: ${reason}`);
            }
            if (!tableExists) {
                context.runtime.missingTables.push(table);
                requiredEntries.forEach(tableEntry => {
                    context.runtime.entriesStatus.bad.push({
                        table,
                        tableEntry
                    });
                });
                checked += requiredEntries.length;
                Logger.error(`Required ${requiredEntries.length} entries in ${table}, but table or view was not found`, { debug: !context.rawInput.printOptions.information, important: true });
            } else {
                var printTableHead: string[] = ['Table name'];
                var printTableData: string[][] = [];
                printTableHead = printTableHead.concat(tableFields.find(o => o.tableName === table).fields);
                printTableHead.push('Status');
                const statuses = await checkTableEntries(table, requiredEntries, count => {
                    checked += count;
                    progress(table);
                });
                requiredEntries.forEach((tableEntry, index) => {
                    const exists = statuses[index];
                    if(exists){
                        context.runtime.entriesStatus.good.push({
                            table,
                            tableEntry
                        });
                    }else{
                        context.runtime.entriesStatus.bad.push({
                            table,
                            tableEntry
                        });
                    }
                    const entryStatus = exists ? `OK` : `NOT FOUND`;
                    printTableData.push([table, ...printTableHead.slice(1, -1).map(field => tableEntry[field] ?? ''), entryStatus]);
                });
                logTable.push({
                    header: printTableHead,
                    data: printTableData
                });
            }
        }

        //3- print tables
        logTable.forEach(t => {
            Logger.table(t.header, t.data, !context.rawInput.printOptions.entriesStatus);
        });

        //4- build output data (declaration order)
        const badEntries = new Map<string, Set<any>>();
        context.runtime.entriesStatus.bad.forEach(o => {
            if(!badEntries.has(o.table)){
                badEntries.set(o.table, new Set());
            }
            badEntries.get(o.table).add(o.tableEntry);
        });
        context.output.sapEntriesStatus = {};
        Object.keys(context.output.sapEntries).forEach(table => {
            context.output.sapEntriesStatus[table] = context.output.sapEntries[table].map(entry => ({
                status: !badEntries.get(table)?.has(entry),
                entry
            }));
        });
    }
}
