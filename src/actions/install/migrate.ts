import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
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
        try {
            for (const transport of context.runtime.generatedData.migrations) {
                Logger.loading(`Migrating ${transport.trkorr}...`);
                const oMigration = await transport.migrate();
                Logger.success(`Migrated ${transport.trkorr} to ${(oMigration as Transport).trkorr}`, true);
            }
        } catch (e) {
            if (e.exceptionType === 'SNRO_INTERVAL_NOT_FOUND') {
                throw new Error(`Missing TRM transport migration number range: re-install server component (run command trm update trm-server).`);
            } else {
                context.runtime.rollback = true;
                throw e;
            }
        }
    },
    revert: async (context: InstallWorkflowContext): Promise<void> => {
        if(context.runtime.rollback){
            Logger.log('Rollback migration step', true);
            
            Logger.loading(`Migration rollback...`);
            for (const transport of context.runtime.generatedData.migrations) {
                Logger.loading(`Removing migration of transport ${transport.trkorr}...`);
                await transport.migrate(true);
                Logger.success(`Removed migration`, true);
            }
        }
    }
}