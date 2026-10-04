import { Step } from "@simonegaffurini/sammarksworkflow";
import { DeleteWorkflowContext } from ".";
import { LockResource } from "../commons/utils";

/** Lock the installed SAP packages and transport before the deletion selection is computed. */
export const lockResources: Step<DeleteWorkflowContext> = {
    name: "lock-resources",
    run: async context => {
        const resources: LockResource[] = [];
        for (const previous of context.runtime.previousInstallPackages || []) {
            resources.push({ type: "DEVCLASS", name: previous.installDevclass });
        }
        if (context.runtime.update.getDevclass()) {
            resources.push({ type: "DEVCLASS", name: context.runtime.update.getDevclass() });
        }
        if (context.runtime.update.getTransport()?.trkorr) {
            resources.push({ type: "TRANSPORT", name: context.runtime.update.getTransport().trkorr });
        }
        await context.lockScope.acquire(resources);
    }
};
