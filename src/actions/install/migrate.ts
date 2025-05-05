import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { Transport } from "../../transport";

/**
 * Migration
 * 
 * 1- upload transport into system
 * 
 * 2 - delete from tms buffer (if it exists)
 * 
 * 3- import transport into system
 * 
*/
export const migrate: Step<InstallWorkflowContext> = {
    name: 'migrate',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.runtime.generatedData.migrations.length > 0) {
            return true;
        } else {
            Logger.log(`Skipping migration (no migrations)`, true);
            return false;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        Logger.log('Migration step', true);

        //context.runtime.rollback = true;

        for (const transport of context.runtime.generatedData.migrations) {
            Logger.loading(`Migrating ${transport.trkorr}...`);
            const oMigration = await transport.migrate();
            Logger.success(`Migrated ${transport.trkorr} to ${(oMigration as Transport).trkorr}`, true);
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        //Logger.log('Rollback migration step', true);
        //TODO
        /*Logger.loading(`Migration rollback...`);
        for (const transport of context.runtime.generatedData.migrations) {
            Logger.loading(`Removing migration of transport ${transport.trkorr}...`);
            await transport.migrate(true);
            Logger.success(`Removed migration`, true);
        }*/
    }
}