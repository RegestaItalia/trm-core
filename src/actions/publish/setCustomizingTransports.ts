import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger, Inquirer } from "trm-commons";
import { Transport } from "../../transport";

/**
 * Set customizing transports
 * 
 * 1- format input customizing transports
 * 
 * 2- input transports
 * 
 * 3- validate transports (check existance, get tasks, rename)
 * 
*/
export const setCustomizingTransports: Step<PublishWorkflowContext> = {
    name: 'set-customizing-transports',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.rawInput.publishData.skipCustomizingTransports) {
            Logger.log(`Skipping customizing transports publish (user input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set customizing transports step', true);

        //1- format input customizing transports
        var customizingTransports: Transport[] = (context.rawInput.publishData.customizingTransports as Transport[]);
        customizingTransports = Object.values(customizingTransports.reduce((acc, t) => {
            acc[t.trkorr] = t;
            return acc;
        }, {} as Record<string, Transport>));

        //2- input transports
        if (!context.rawInput.contextData.noInquirer) {
            const addCust = (await Inquirer.prompt({
                message: customizingTransports.length > 0 ? `Do you want to add more customizing transports?` : `Do you want to add customizing transports?`,
                name: 'continue',
                type: 'confirm',
                default: customizingTransports.length > 0
            })).continue;
            if (addCust) {
                var option: number | Transport;
                do {
                    var options: any[] = [];
                    for (const transport of customizingTransports) {
                        var description;
                        try {
                            description = await transport.getDescription();
                        } catch {
                            description = '';
                        }
                        options.push({
                            name: `- ${Transport.getTransportIcon()}  ${transport.trkorr} ${description}`.trim(),
                            value: transport
                        });
                    }
                    options.push({
                        name: `+ Add`,
                        value: 1
                    });
                    options.push({
                        name: `x Done`,
                        value: 2
                    });
                    option = (await Inquirer.prompt({
                        message: 'Select option',
                        name: 'option',
                        type: 'list',
                        choices: options,
                        default: 1
                    })).option;
                    if (option === 1) {
                        const trkorr = (await Inquirer.prompt({
                            message: 'Input customizing transport request',
                            name: 'trkorr',
                            type: 'input',
                            validate: async (input) => {
                                try {
                                    if (customizingTransports.find(o => o.trkorr === input.trim())) {
                                        return 'Already added';
                                    }
                                    const trFunction = (await (new Transport(input.trim())).getE070()).trfunction;
                                    if (trFunction !== 'W') {
                                        return 'Transport request must be of type customizing';
                                    } else {
                                        return true;
                                    }
                                } catch {
                                    return 'Invalid transport request';
                                }
                            }
                        })).trkorr;
                        customizingTransports.push(new Transport(trkorr.trim()));
                    } else if (option instanceof Transport) {
                        customizingTransports = customizingTransports.filter(o => o.trkorr !== (option as Transport).trkorr);
                    }
                } while (option !== 2);
            }

            //3- validate transports (check existance, get tasks, rename)
            const maxDescLength = 60 - `@X1@TRM: ${context.rawInput.packageData.name} v${context.rawInput.packageData.version} (C) `.length;
            for (const transport of customizingTransports) {
                try {
                    const e070 = await transport.getE070();
                    if (e070.trfunction !== 'W') {
                        Logger.warning(`Transport ${transport.trkorr} is not of type customizing`);
                        throw new Error(); //dummy
                    }
                    const tasks = await transport.getTasks();
                    var desc = await transport.getDescription();
                    if (!context.rawInput.contextData.noInquirer) {
                        desc = (await Inquirer.prompt({
                            message: `Description of ${transport.trkorr}`,
                            type: 'input',
                            name: 'desc',
                            default: desc,
                            validate: (input) => {
                                if(input.length > maxDescLength){
                                    return `Description cannot exceede ${maxDescLength} characters`;
                                }else{
                                    return true;
                                }
                            }
                        })).desc || desc;
                    }
                    context.runtime.systemData.originCustomizing.push({
                        transports: [transport].concat(tasks),
                        description: desc
                    });
                } catch {
                    Logger.warning(`Invalid transport ${transport.trkorr}, ignored`);
                }
            }
        }
    }
}