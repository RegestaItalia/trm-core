import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext, SapEntriesDependency } from ".";
import { Logger, TreeLog } from "../../logger";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";
import chalk from "chalk";

const _getTableTreeText = (tableData: any): string => {
    var aValues = [];
    Object.keys(tableData).forEach(k => {
        aValues.push(`${k}: ${tableData[k]}`);
    });
    return aValues.join(', ');
}

const _getSapEntriesTreeChildren = (sapEntries: SapEntriesDependency[], highlightTable: boolean): TreeLog[] => {
    var treeChildren = [];
    sapEntries.forEach(k => {
        var referenceTableTree: TreeLog = {
            text: highlightTable ? chalk.bold(k.table) : k.table,
            children: []
        };
        k.dependencies.forEach(y => {
            const tableKey = _getTableTreeText(y.object);
            const tadirKey = `${y.foundIn.pgmid} ${y.foundIn.object} ${y.foundIn.objName}`;
            const arrayIndex = referenceTableTree.children.findIndex(o => o.text === tableKey);
            const usedByTree: TreeLog = {
                text: `Used by`,
                children: []
            };
            const usedByTadirTree: TreeLog = {
                text: tadirKey,
                children: []
            };
            usedByTree.children.push(usedByTadirTree);
            if(arrayIndex >= 0){
                if(!referenceTableTree.children[arrayIndex].children[0].children.find(o => o.text === tadirKey)){
                    referenceTableTree.children[arrayIndex].children[0].children.push(usedByTadirTree);
                }
            }else{
                referenceTableTree.children.push({
                    text: tableKey,
                    children: [usedByTree]
                });
            }
        });
        treeChildren.push(referenceTableTree);
    });
    return treeChildren;
}

/**
 * Print dependencies output.
 * 
 * 1- 
 * 
*/
export const print: Step<FindDependenciesWorkflowContext> = {
    name: 'print',
    filter: async (context: FindDependenciesWorkflowContext): Promise<boolean> => {
        if(context.rawInput.printOptions.trmDependencies || context.rawInput.printOptions.sapObjectDependencies){
            return true;
        }else{
            Logger.log(`Skipping dependency print status (user input)`, true);
            return false;
        }
    },
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Print step', true);

        const sapEntries = context.runtime.dependencies.sapObjects;
        const unknownDependencies = context.runtime.dependencies.withoutTrmPackage;
        const trmDependencies = context.runtime.dependencies.withTrmPackage;

        var baseTree: TreeLog = {
            text: chalk.bold(context.rawInput.packageData.package),
            children: []
        };
        var sapEntriesTree: TreeLog = {
            text: chalk.underline(`Required SAP Entries (${sapEntries.reduce((sum, o) => sum + o.dependencies.length,0)})`),
            children: _getSapEntriesTreeChildren(sapEntries, true)
        };
        var unknownDependenciesTree: TreeLog = {
            text: chalk.underline(`Without TRM Package (${unknownDependencies.length})`),
            children: []
        };
        var trmDependenciesTree: TreeLog = {
            text: chalk.underline(`TRM Packages (${trmDependencies.length})`),
            children: []
        };

        unknownDependencies.forEach(o => {
            unknownDependenciesTree.children.push({
                text: chalk.bold(o.devclass),
                children: [{
                    text: `References`,
                    children: _getSapEntriesTreeChildren(o.sapEntries, false)
                }]
            });
        });

        trmDependencies.forEach(o => {
            trmDependenciesTree.children.push({
                text: chalk.bold(o.package.packageName),
                children: [{
                    text: `Registry: ${o.package.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : o.package.registry.endpoint}`,
                    children: []
                }, {
                    text: `Version: ${o.package.manifest.get().version}`,
                    children: []
                }, {
                    text: `References`,
                    children: _getSapEntriesTreeChildren(o.sapEntries, false)
                }]
            });
        });

        if(context.rawInput.printOptions.sapObjectDependencies){
            baseTree.children.push(sapEntriesTree);
        }
        if(context.rawInput.printOptions.trmDependencies){
            baseTree.children.push(unknownDependenciesTree);
            baseTree.children.push(trmDependenciesTree);
        }

        Logger.tree(baseTree);
    }
}