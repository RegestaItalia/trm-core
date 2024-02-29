import { Step } from "@sammarks/workflow";
import { CheckSapEntriesWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";

export const analizeSapEntries: Step<CheckSapEntriesWorkflowContext> = {
    name: 'analize-sap-entries',
    filter: async (context: CheckSapEntriesWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.sapEntries && Object.keys(context.parsedInput.sapEntries).length > 0) {
            return true;
        } else {
            Logger.info(`Package ${context.parsedInput.packageName} has no SAP entries`, context.parsedInput.print);
            return false;
        }
    },
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        const sapEntries = context.parsedInput.sapEntries;
        Logger.info(`Package ${context.parsedInput.packageName} has ${sapEntries.length} SAP entries`, context.parsedInput.print);
        context.runtime.okEntries = [];
        context.runtime.koEntries = [];
        context.runtime.tables = [];

        var entriesCount = 0;
        var unknownTables: string[] = [];
        var tableFields: {
            tableName: string,
            fields: string[]
        }[] = [];
        
        Object.keys(sapEntries).forEach(tableName => {
            var aFields: string[] = [];
            sapEntries[tableName].forEach(o => {
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

        if(entriesCount === 0){
            return;
        }

        Logger.info(`Package ${context.parsedInput.packageName} has ${entriesCount} SAP entries`, context.parsedInput.print);

        for (const table of Object.keys(sapEntries)) {
            var tableExists: boolean;
            try {
                tableExists = await SystemConnector.checkSapEntryExists('TADIR', {
                    pgmid: 'R3TR',
                    object: 'TABL',
                    obj_name: table
                });
            } catch (e) {
                tableExists = false;
            }
            if (!tableExists) {
                unknownTables.push(table);
                Logger.error(`Required ${sapEntries[table].length} entries in ${table}, but table was not found`, context.parsedInput.print);
            } else {
                var printTableHead: string[] = ['Table name'];
                var printTableData: string[][] = [];
                var tableData: string[];
                printTableHead = printTableHead.concat(tableFields.find(o => o.tableName === table).fields);
                printTableHead.push('Status');
                for(const tableEntry of sapEntries[table]){
                    tableData = [table];
                    var entryStatus;
                    try{
                        const exists = SystemConnector.checkSapEntryExists(table, tableEntry);
                        if(exists){
                            entryStatus = `OK`;
                            context.runtime.okEntries.push({
                                table,
                                tableEntry
                            });
                        }else{
                            entryStatus = `NOT FOUND`;
                            context.runtime.koEntries.push({
                                table,
                                tableEntry
                            });
                        }
                    }catch(e){
                        Logger.error(e.toString(), true);
                        Logger.error(`Error during check of SAP entry ${JSON.stringify(tableEntry)}`, true);
                        entryStatus = `Unknown`;
                        context.runtime.koEntries.push({
                            table,
                            tableEntry
                        });
                    }
                    Object.keys(tableEntry).forEach(field => {
                        const pushIndex = printTableHead.findIndex(headerName => headerName === field);
                        tableData.splice(pushIndex, 0, tableEntry[field]);
                    });
                    tableData.push(entryStatus);
                    printTableData.push(tableData);
                }
                context.runtime.tables.push({
                    head: printTableHead,
                    data:printTableData
                });
            }
        }
        context.runtime.tables.forEach(t => {
            Logger.table(t.head, t.data, context.parsedInput.print);
        });
    }
}