import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { TrmPackage } from "../../trmPackage";
import { Inquirer, validateDevclass, validateTransportTarget } from "../../inquirer";
import { DEVCLASS, TR_TARGET } from "../../client";

/**
 * Set publish release transport target
 * 
 * 1- set input transport target
 * 
 * 2- user input transport target
 * 
*/
export const setTransportTarget: Step<PublishWorkflowContext> = {
    name: 'set-transport-target',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set transport target step', true);

        var needsValidation: boolean;

        //1- set input transport target
        var transportTarget: TR_TARGET = context.rawInput.systemData.transportTarget;

        if (transportTarget === undefined) {
            if(!context.rawInput.contextData.noInquirer){
                //2- user input transport target
                transportTarget = (await Inquirer.prompt({
                    type: "list",
                    message: "Publish transport target",
                    name: "transportTarget",
                    validate: async (input: string) => {
                        return await validateTransportTarget(input, context.runtime.systemData.transportTargets);
                    },
                    choices: context.runtime.systemData.transportTargets.map(o => {
                        return {
                            name: `${o.sysnam} (${o.systxt})`,
                            value: o.sysnam
                        }
                    })
                })).transportTarget;
            }else{
                throw new Error(`Release transport target was not declared.`);
            }

            needsValidation = false;
        } else {
            needsValidation = true;
        }

        if (needsValidation) {
            const validate = await validateTransportTarget(transportTarget, context.runtime.systemData.transportTargets);
            if (validate && validate !== true) {
                throw new Error(validate);
            }
            Logger.info(`Publish transport release target: ${transportTarget}`);
        }


        context.rawInput.systemData.transportTarget = transportTarget;
    }
}