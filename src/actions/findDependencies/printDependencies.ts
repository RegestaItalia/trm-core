import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { Logger, TreeLog } from "../../logger";
import { ParsedSenvi } from "../../dependency";

const _addTadirToBranch = (tadir: ParsedSenvi, branch: TreeLog) => {
    const key = `${tadir.pgmid} ${tadir.object} ${tadir.objName}`;
    if (tadir.subObject) {
        var parentIndex = branch.children.findIndex(o => o.text === key);
        if (parentIndex < 0) {
            parentIndex = branch.children.push({
                text: key,
                children: []
            });
            parentIndex--;
        }
        if (tadir.subObject.func) {
            branch.children[parentIndex].children.push({
                text: `FM ${tadir.subObject.func}`,
                children: []
            });
        }
    } else {
        if (!branch.children.find(o => o.text === key)) {
            branch.children.push({
                text: key,
                children: []
            });
        }
    }
    return branch;
}

export const printDependencies: Step<FindDependenciesWorkflowContext> = {
    name: 'print-dependencies',
    filter: async (context: FindDependenciesWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.print) {
            return true;
        } else {
            Logger.log(`Skipping print (input)`, true);
            return false;
        }
    },
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var treeLogData: TreeLog;
        const deepCheckTree = context.output.deepCheckTree;
        const dependencies = context.output.dependencies;
        if (deepCheckTree) {
            //TODO
        } else {
            if (dependencies) {
                treeLogData = {
                    text: context.parsedInput.devclass,
                    children: []
                };
                var sapDependencyBranch: TreeLog = {
                    text: `SAP: TADIR Entries`,
                    children: []
                };
                dependencies.filter(o => o.isSap).forEach(o => {
                    o.tadir.forEach(k => {
                        sapDependencyBranch.children.push({
                            text: `${k.pgmid} ${k.object} ${k.objName}`,
                            children: []
                        });
                    });
                });
                if (sapDependencyBranch.children.length > 0) {
                    treeLogData.children.push(sapDependencyBranch);
                }
                var noTrmDependencies: TreeLog = {
                    text: `TRM package not found`,
                    children: []
                };
                dependencies.filter(o => !o.isSap && !o.trmPackage).forEach(o => {
                    var packageBranch: TreeLog = {
                        text: ``,
                        children: []
                    };
                    var packageTadirBranch: TreeLog = {
                        text: `Object list`,
                        children: []
                    };
                    var usedInBranch: TreeLog = {
                        text: `Where used list`,
                        children: []
                    };
                    o.tadir.forEach(k => {
                        packageBranch.text = k.devclass
                        packageTadirBranch = _addTadirToBranch(k, packageTadirBranch);
                    })
                    o.dependencyIn.forEach(k => {
                        usedInBranch = _addTadirToBranch(k, usedInBranch);
                    });
                    packageBranch.children.push(packageTadirBranch);
                    packageBranch.children.push(usedInBranch);
                    noTrmDependencies.children.push(packageBranch);
                });
                if (noTrmDependencies.children.length > 0) {
                    treeLogData.children.push(noTrmDependencies);
                }
                dependencies.filter(o => !o.isSap && o.trmPackage).forEach(o => {
                    var sVersion: string;
                    try {
                        sVersion = `^${o.trmPackage.manifest.get().version}`;
                    } catch (e) {
                        sVersion = ``;
                    }
                    treeLogData.children.push({
                        text: `${o.trmPackage.packageName} ${sVersion}`,
                        children: []
                    });
                });
            }
        }
        if (treeLogData) {
            Logger.tree(treeLogData);
        }
    }
}