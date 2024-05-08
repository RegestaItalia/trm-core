import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Inquirer } from "../../inquirer/Inquirer";
import { validateTransportTarget } from "../../inquirer";
import { SystemConnector } from "../../systemConnector";
import { Logger } from "../../logger";

export const setTransportTarget: Step<PublishWorkflowContext> = {
    name: 'set-transport-target',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        var trTarget = context.parsedInput.target;

        var systemTmscsys = await SystemConnector.getTransportTargets();
        systemTmscsys = systemTmscsys.sort((a, b) => {
            if (a.systyp === 'V') {
                return -1;
            } else if (b.systyp === 'V') {
                return 1;
            } else {
                return 0;
            }
        });
        if (!trTarget) {
            const inq2 = await Inquirer.prompt({
                type: "list",
                message: "Transport request target",
                name: "trTarget",
                validate: async (input: string) => {
                    return await validateTransportTarget(input, systemTmscsys);
                },
                choices: systemTmscsys.map(o => {
                    return {
                        name: `${o.sysnam} (${o.systxt})`,
                        value: o.sysnam
                    }
                })
            });
            trTarget = inq2.trTarget.trim().toUpperCase();
        } else {
            trTarget = trTarget.trim().toUpperCase();
            const trTargetValid = await validateTransportTarget(trTarget, systemTmscsys);
            if (trTargetValid && trTargetValid !== true) {
                throw new Error(trTargetValid);
            }
        }
        Logger.log(`Publish target: ${trTarget}`, true);
        context.parsedInput.trTarget = trTarget;
    }
}