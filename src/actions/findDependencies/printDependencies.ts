import { Step } from "@sammarks/workflow";
import { FindDependenciesWorkflowContext } from ".";
import { Logger, TreeLog } from "../../logger";

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
        if(deepCheckTree){
            //TODO
        }else{
            if(dependencies){
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
                if(sapDependencyBranch.children.length > 0){
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
                        packageTadirBranch.children.push({
                            text: `${k.pgmid} ${k.object} ${k.objName}`,
                            children: []
                        });
                    })
                    o.dependencyIn.forEach(k => {
                        usedInBranch.children.push({
                            text: `${k.pgmid} ${k.object} ${k.objName}`,
                            children: []
                        });
                    });
                    packageBranch.children.push(packageTadirBranch);
                    packageBranch.children.push(usedInBranch);
                    noTrmDependencies.children.push(packageBranch);
                });
                if(noTrmDependencies.children.length > 0){
                    treeLogData.children.push(noTrmDependencies);
                }
                dependencies.filter(o => !o.isSap && o.trmPackage).forEach(o => {
                    var sVersion: string;
                    try{
                        sVersion = `^${o.trmPackage.manifest.get().version}`;
                    }catch(e){
                        sVersion = ``;
                    }
                    treeLogData.children.push({
                        text: `${o.trmPackage.packageName} ${sVersion}`,
                        children: []
                    });
                });
            }
        }
        if(treeLogData){
            Logger.tree(treeLogData);
        }
    }
}