import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer";
import { Transport } from "../../transport";

/**
 * Set customizing transports
 * 
 * 1- input transports
 * 
 * 2- validate transports (check existance and get tasks)
 * 
*/
export const setCustomizingTransports: Step<PublishWorkflowContext> = {
    name: 'set-customizing-transports',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if(context.rawInput.publishData.skipCustomizingTransports){
            Logger.log(`Skipping customizing transports publish (user input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Set customizing transports step', true);

        //1- input transports
        if(!context.rawInput.contextData.noInquirer){
            var defaultTransports: string;
            if(Array.isArray(context.rawInput.publishData.customizingTransports)){
                defaultTransports = context.rawInput.publishData.customizingTransports.map(o => {
                    return o.trkorr;
                }).join(', ');
            }else{
                defaultTransports = context.rawInput.publishData.customizingTransports;
            }
            const inq = await Inquirer.prompt({
                message: `Add customizing transports (separated by comma)`,
                name: 'transports',
                type: 'input',
                default: defaultTransports
            });
            context.rawInput.publishData.customizingTransports = inq.transports;
        }
        if(typeof(context.rawInput.publishData.customizingTransports) === 'string'){
            context.rawInput.publishData.customizingTransports = context.rawInput.publishData.customizingTransports.split(',').map(o => {
                if(o){
                    try{
                        return new Transport(o.trim());
                    }catch(e){
                        throw new Error(`Invalid customizing transport values: trkorr.`);
                    }
                }
            }).filter(o => o !== undefined);
        }

        //2- validate transports (check existance and get tasks)
        var validatedTransports: Transport[] = [];
        if(Array.isArray(context.rawInput.publishData.customizingTransports) && context.rawInput.publishData.customizingTransports.length > 0){
            Logger.loading(`Reading customizing transports...`);
            for(const transport of context.rawInput.publishData.customizingTransports){
                Logger.log(`Checking transport ${transport.trkorr}`, true);
                if(await transport.getE070()){
                    if(!validatedTransports.find(o => o.trkorr === transport.trkorr)){
                        Logger.log(`Transport ${transport.trkorr} is validated`, true);
                        validatedTransports.push(transport);
                    }
                    const tasks = await transport.getTasks();
                    tasks.forEach(task => {
                        if(!validatedTransports.find(o => o.trkorr === task.trkorr)){
                            Logger.log(`Transport ${transport.trkorr} task is validated`, true);
                            validatedTransports.push(task);
                        }
                    });
                }else{
                    Logger.log(`Transport ${transport.trkorr} doesn't exist`, true);
                }
            }
            Logger.info(`${validatedTransports} customizing transports/tasks will be published.`);
        }
    }
}