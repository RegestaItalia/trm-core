import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckSapEntriesWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

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
        for (const table of Object.keys(context.output.sapEntries)) {
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
                context.output.sapEntries[table].forEach(tableEntry => {
                    context.runtime.entriesStatus.bad.push({
                        table,
                        tableEntry
                    });
                });
                Logger.error(`Required ${context.output.sapEntries[table].length} entries in ${table}, but table or view was not found`, { debug: !context.rawInput.printOptions.information, important: true });
            } else {
                var printTableHead: string[] = ['Table name'];
                var printTableData: string[][] = [];
                var tableData: string[];
                printTableHead = printTableHead.concat(tableFields.find(o => o.tableName === table).fields);
                printTableHead.push('Status');
                for(const tableEntry of context.output.sapEntries[table]){
                    tableData = [table];
                    var exists: boolean;
                    try{
                        exists = await SystemConnector.checkSapEntryExists(table, tableEntry);
                    }catch(e){
                        const reason = e instanceof Error ? e.message : String(e);
                        throw new Error(`Unable to check required SAP entry ${JSON.stringify(tableEntry)} in table "${table}": ${reason}`);
                    }
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
                    tableData = tableData.concat(printTableHead.slice(1, -1).map(field => tableEntry[field] ?? ''));
                    tableData.push(entryStatus);
                    printTableData.push(tableData);
                }
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
