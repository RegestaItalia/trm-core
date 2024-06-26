import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext } from ".";
import { validateDevclass } from "../../inquirer";

export const init: Step<FindDependenciesWorkflowContext> = {
    name: 'init',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        var devclass = context.rawInput.devclass;

        const devclassValid = await validateDevclass(devclass, true);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }

        context.parsedInput.devclass = devclass;
        context.parsedInput.print = context.rawInput.print ? true : false;
        if(context.parsedInput.print){
            context.parsedInput.printSapEntries = context.rawInput.printSapEntries ? true : false;
        }else{
            context.parsedInput.printSapEntries = false;
        }
        context.parsedInput.tadir = context.rawInput.tadir || [];
        context.parsedInput.systemPackages = context.rawInput.systemPackages || [];
        context.parsedInput.silent = context.rawInput.silent;

        context.output.trmDependencies = [];
        context.output.unknownDependencies = [];
        context.output.sapEntries = [];
    }
}