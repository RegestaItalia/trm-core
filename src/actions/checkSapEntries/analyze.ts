import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckSapEntriesWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";

/**
 * Analyze
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
            Logger.info(`Package ${context.rawInput.packageData.package.packageName} has no SAP entries`, !context.rawInput.printOptions.information);
            return false;
        }
    },
    run: async (context: CheckSapEntriesWorkflowContext): Promise<void> => {
        Logger.log('Analyze step', true);

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

        Logger.info(`Package ${context.rawInput.packageData.package.packageName} has ${entriesCount} SAP entries`, !context.rawInput.printOptions.information);
        if(entriesCount === 0){
            return;
        }

        //2- check entries
        for (const table of Object.keys(context.output.sapEntries)) {
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
                context.runtime.missingTables.push(table);
                Logger.error(`Required ${context.output.sapEntries[table].length} entries in ${table}, but table was not found`, !context.rawInput.printOptions.information);
            } else {
                var printTableHead: string[] = ['Table name'];
                var printTableData: string[][] = [];
                var tableData: string[];
                printTableHead = printTableHead.concat(tableFields.find(o => o.tableName === table).fields);
                printTableHead.push('Status');
                for(const tableEntry of context.output.sapEntries[table]){
                    tableData = [table];
                    var entryStatus;
                    try{
                        const exists = await SystemConnector.checkSapEntryExists(table, tableEntry);
                        if(exists){
                            entryStatus = `OK`;
                            context.runtime.entriesStatus.good.push({
                                table,
                                tableEntry
                            });
                        }else{
                            entryStatus = `NOT FOUND`;
                            context.runtime.entriesStatus.bad.push({
                                table,
                                tableEntry
                            });
                        }
                    }catch(e){
                        Logger.error(e.toString(), true);
                        Logger.error(`Error during check of SAP entry ${JSON.stringify(tableEntry)}`, true);
                        entryStatus = `Unknown`;
                        context.runtime.entriesStatus.bad.push({
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

        //4- build output data
        context.output.sapEntriesStatus = {};
        context.runtime.entriesStatus.good.forEach(o => {
            if(!context.output.sapEntriesStatus[o.table]){
                context.output.sapEntriesStatus[o.table] = [];
            }
            context.output.sapEntriesStatus[o.table].push({
                status: true,
                entry: o.tableEntry
            });
        });
        context.runtime.entriesStatus.bad.forEach(o => {
            if(!context.output.sapEntriesStatus[o.table]){
                context.output.sapEntriesStatus[o.table] = [];
            }
            context.output.sapEntriesStatus[o.table].push({
                status: false,
                entry: o.tableEntry
            });
        });
    }
}