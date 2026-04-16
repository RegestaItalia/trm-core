import { Inquirer, Logger } from "trm-commons";
import { TARSYSTEM } from "../../../client";
import chalk from "chalk";
import { validateTransportTarget } from "../../../validators";

export async function setTransportTarget(noInquirer: boolean, systemTargets: TARSYSTEM[], userInput?: TARSYSTEM, inquirerMessage?: string): Promise<TARSYSTEM> {
    var needsValidation: boolean;

    var transportTarget: TARSYSTEM = userInput;

    if (transportTarget === undefined) {
        if (systemTargets.length === 1) {
            transportTarget = systemTargets[0];
            Logger.info(`Target system automatically set to ${chalk.bold(transportTarget)}`);
        } else {
            if (!noInquirer) {
                transportTarget = (await Inquirer.prompt({
                    type: "list",
                    message: inquirerMessage || 'Transport target',
                    name: "transportTarget",
                    validate: async (input: string) => {
                        return await validateTransportTarget(input, systemTargets);
                    },
                    choices: systemTargets.map(o => {
                        return {
                            name: o,
                            value: o
                        }
                    })
                })).transportTarget;
            } else {
                throw new Error(`Transport target was not declared.`);
            }
        }
        needsValidation = false;
    } else {
        needsValidation = true;
    }

    if (needsValidation) {
        const validate = await validateTransportTarget(transportTarget, systemTargets);
        if (validate && validate !== true) {
            throw new Error(validate);
        }
        Logger.info(`Target system: ${chalk.bold(transportTarget)}`);
    }

    return transportTarget;
}