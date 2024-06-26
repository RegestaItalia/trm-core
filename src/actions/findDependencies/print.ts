import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext, SapEntriesDependency } from ".";
import { CliLogger, Logger, TreeLog } from "../../logger";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

const _getTableTreeText = (tableData: any): string => {
    var aValues = [];
    Object.keys(tableData).forEach(k => {
        aValues.push(`${k}: ${tableData[k]}`);
    });
    return aValues.join(', ');
}

const _getSapEntriesTreeChildren = (sapEntries: SapEntriesDependency[]): TreeLog[] => {
    var treeChildren = [];
    sapEntries.forEach(k => {
        var referenceTableTree: TreeLog = {
            text: k.table,
            children: []
        };
        k.dependencies.forEach(y => {
            const tableKey = _getTableTreeText(y.tableDependency);
            const tadirKey = `${y.dependencyIn.pgmid} ${y.dependencyIn.object} ${y.dependencyIn.objName}`;
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

export const print: Step<FindDependenciesWorkflowContext> = {
    name: 'print',
    filter: async (context: FindDependenciesWorkflowContext): Promise<boolean> => {
        if(context.parsedInput.print){
            return true;
        }else{
            Logger.log(`Skipping print (input)`, true);
            return false;
        }
    },
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        const sapEntries = context.output.sapEntries;
        const unknownDependencies = context.output.unknownDependencies;
        const trmDependencies = context.output.trmDependencies;

        var baseTree: TreeLog = {
            text: context.parsedInput.devclass,
            children: []
        };
        var sapEntriesTree: TreeLog = {
            text: `Required SAP Entries`,
            children: _getSapEntriesTreeChildren(sapEntries)
        };
        var unknownDependenciesTree: TreeLog = {
            text: `Without TRM Package`,
            children: []
        };
        var trmDependenciesTree: TreeLog = {
            text: `TRM Packages`,
            children: []
        };

        unknownDependencies.forEach(o => {
            unknownDependenciesTree.children.push({
                text: o.devclass,
                children: [{
                    text: `References`,
                    children: _getSapEntriesTreeChildren(o.sapEntries)
                }]
            });
        });

        trmDependencies.forEach(o => {
            trmDependenciesTree.children.push({
                text: o.trmPackage.packageName,
                children: [{
                    text: `Registry: ${o.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : o.trmPackage.registry.endpoint}`,
                    children: []
                }, {
                    text: `Version: ${o.trmPackage.manifest.get().version}`,
                    children: []
                }, {
                    text: `References`,
                    children: _getSapEntriesTreeChildren(o.sapEntries)
                }]
            });
        });

        if(context.parsedInput.printSapEntries){
            baseTree.children.push(sapEntriesTree);
        }
        baseTree.children.push(unknownDependenciesTree);
        baseTree.children.push(trmDependenciesTree);

        Logger.tree(baseTree);
    }
}