import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { Inquirer } from "../../inquirer/Inquirer";
import { Transport } from "../../transport";


export const setCustTransports: Step<PublishWorkflowContext> = {
    name: 'set-cust-transports',
    filter: async (context: PublishWorkflowContext): Promise<boolean> => {
        if (context.parsedInput.skipCust) {
            Logger.log(`Skipping set CUST transports (input)`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: PublishWorkflowContext): Promise<void> => {
        var customizingTransports = context.parsedInput.customizingTransports;
        const inq1 = await Inquirer.prompt({
            message: `Customizing transports (separated by comma, leave blank for no customizing)`,
            name: 'transports',
            type: 'input',
            when: customizingTransports.length === 0
        });
        customizingTransports = customizingTransports.concat((inq1.transports || '').split(',')).filter(o => o);
        var aTransports: Transport[] = [];
        if (customizingTransports.length > 0) {
            Logger.loading(`Reading customizing transports...`);
            for (var trkorr of customizingTransports) {
                trkorr = trkorr.trim().toUpperCase();
                //TODO
                //check transport exists
                //check transport type workbench or customizing
                const mainTransport = new Transport(trkorr);
                const tasks = await mainTransport.getTasks();
                aTransports.push(mainTransport);
                aTransports = aTransports.concat(tasks);
            }
        }
        context.runtime.inputCustTransports = aTransports;
    }
}