import { Step } from "@sammarks/workflow";
import { CheckSapEntriesWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { Registry } from "../../registry";
import { satisfies } from "semver";
import { SystemConnector } from "../../systemConnector";

export const analizeSapEntries: Step<CheckSapEntriesWorkflowContext> = {
    name: 'analize-sap-entries',
    filter: async (context: CheckSapEntriesWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.sapEntries && context.parsedInput.sapEntries.length > 0) {
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

        var unknownTables: string[] = [];
        var tableFields: {
            tableName: string,
            fields: string[]
        }[] = [];
        
        Object.keys(sapEntries).forEach(tableName => {
            var aFields: string[] = [];
            sapEntries[tableName].forEach(o => {
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
                        }else{
                            entryStatus = `NOT FOUND`;
                        }
                    }catch(e){
                        Logger.error(e.toString(), true);
                        Logger.error(`Error during check of SAP entry ${JSON.stringify(tableEntry)}`, true);
                        entryStatus = `Unknown`;
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
        debugger
        /*
        var tableData: string[];
        for(const dependency of dependencies){
            tableData = [dependency.name, dependency.registry || 'public', dependency.version];
            const dependencyTrmPackage = new TrmPackage(dependency.name, new Registry(dependency.registry || 'public'));
            const systemInstalledPackage = systemPackages.find(o => TrmPackage.compare(o, dependencyTrmPackage));
            if(systemInstalledPackage && systemInstalledPackage.manifest){
                const installedVersion = systemInstalledPackage.manifest.get().version;
                tableData.push(installedVersion);
                if(satisfies(installedVersion, dependency.version)){
                    tableData.push('OK');
                    context.runtime.versionOkDependencies.push(dependency);
                }else{
                    tableData.push('ERR!');
                    context.runtime.versionKoDependencies.push(dependency);
                }
            }else{
                tableData.push('Not found');
                tableData.push('ERR!');
                context.runtime.versionKoDependencies.push(dependency);
            }
            try{
                const installedPackageIntegrity = await SystemConnector.getPackageIntegrity(systemInstalledPackage);
                if(installedPackageIntegrity === dependency.integrity){
                    tableData.push('Safe');
                    context.runtime.integrityOkDependencies.push(dependency);
                }else{
                    tableData.push('Unsafe');
                    context.runtime.integrityKoDependencies.push(dependency);
                }
            }catch(e){
                tableData.push('Unknown');
                context.runtime.integrityKoDependencies.push(dependency);
                Logger.error(e.toString(), true);
                Logger.error(`Couldn't retrieve package integrity`, true);
            }
            context.runtime.table.data.push(tableData);
        }
        Logger.table(context.runtime.table.head, context.runtime.table.data, context.parsedInput.print);*/
    }
}