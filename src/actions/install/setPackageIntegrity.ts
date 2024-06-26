import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { PUBLIC_RESERVED_KEYWORD, RegistryType } from "../../registry";

export const setPackageIntegrity: Step<InstallWorkflowContext> = {
    name: 'set-package-integrity',
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const packageName = context.parsedInput.packageName;
        const registry = context.runtime.registry;
        const packageRegistry = registry.getRegistryType() === RegistryType.PUBLIC ? PUBLIC_RESERVED_KEYWORD : registry.endpoint;
        const fetchedIntegrity = context.runtime.fetchedIntegrity;
        Logger.loading(`Finalizing install...`);
        await SystemConnector.setPackageIntegrity({
            package_name: packageName,
            package_registry: packageRegistry,
            integrity: fetchedIntegrity
        });
    }
}