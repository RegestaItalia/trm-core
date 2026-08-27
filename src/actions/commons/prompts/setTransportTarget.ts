import { Inquirer, Logger } from "trm-commons";
import { TARSYSTEM } from "../../../client";
import chalk from "chalk";
import { validateTransportTarget } from "../../../validators";

/**
 * Resolves and validates the target system for a transport.
 *
 * A supplied `userInput` is validated against `systemTargets`. Without an explicit
 * value, the sole available target is selected automatically; otherwise the user is
 * prompted unless `noInquirer` is enabled.
 *
 * @param noInquirer Disable interactive target selection.
 * @param systemTargets Transport targets available in the connected SAP system.
 * @param userInput Explicit target to validate and use.
 * @param inquirerMessage Prompt label used when interactive selection is required.
 * @returns The selected, valid transport target.
 * @throws When no targets are available, the explicit target is invalid, or a required target was
 * not supplied in non-interactive mode.
 */
export async function setTransportTarget(noInquirer: boolean, systemTargets: TARSYSTEM[], userInput?: TARSYSTEM, inquirerMessage?: string): Promise<TARSYSTEM> {
    if (systemTargets.length === 0) {
        throw new Error(`No transport targets are available in the connected SAP system.`);
    }

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
