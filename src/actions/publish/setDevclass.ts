import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer } from "../../inquirer/Inquirer";
import { validateDevclass } from "../../inquirer";
import { Logger } from "../../logger";

export const setDevclass: Step<PublishWorkflowContext> = {
    name: 'set-devclass',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        var devclass = context.parsedInput.devclass;
        
        if (!devclass) {
            if(context.parsedInput.silent){
                throw new Error(`Running in silent mode and devclass was not set.`);
            }
            //devclass default value could be provided (if the package already exists in the system)
            //TODO find
            const inq1 = await Inquirer.prompt({
                type: "input",
                message: "Package devclass",
                name: "devclass",
                validate: async (input: string) => {
                    return await validateDevclass(input);
                }
            });
            devclass = inq1.devclass;
        }
        devclass = devclass.trim().toUpperCase();

        const devclassValid = await validateDevclass(devclass);
        if (devclassValid && devclassValid !== true) {
            throw new Error(devclassValid);
        }
        
        Logger.log(`Publish devclass: ${devclass}`, true);
        context.parsedInput.devclass = devclass;
    }
}