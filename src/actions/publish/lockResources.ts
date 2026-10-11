import { Step } from "@simonegaffurini/sammarksworkflow";
import { LockResource, objectLockResource } from "../commons/utils";
import { PublishWorkflowContext } from ".";

/** Reserve the source package and all workbench objects before creating transports. */
export const lockResources: Step<PublishWorkflowContext> = {
    name: "lock-resources",
    run: async context => {
        const resources: LockResource[] = [
            { type: "DEVCLASS", name: context.rawInput.packageData.devclass }
        ];
        for (const object of context.runtime.sapPackage.objects) {
            resources.push(objectLockResource(object));
            if (object.pgmid.trim().toUpperCase() === "R3TR" && object.object.trim().toUpperCase() === "DEVC") {
                resources.push({ type: "DEVCLASS", name: object.objName });
            }
        }
        await context.lockScope.acquire(resources);
    }
};

