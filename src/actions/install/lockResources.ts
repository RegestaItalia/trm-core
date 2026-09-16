import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { LockResource, objectLockResource, packageLockResource } from "../commons/utils";

/** Lock the selected import payload and its resolved target packages before dependencies mutate SAP. */
export const lockResources: Step<InstallWorkflowContext> = {
    name: "lock-resources",
    run: async context => {
        const replacements = new Map(
            (context.rawInput.installData.installDevclass.replacements || [])
                .map(row => [row.originalDevclass.trim().toUpperCase(), row.installDevclass.trim().toUpperCase()])
        );
        const resources: LockResource[] = [];
        resources.push(packageLockResource(context.rawInput.packageData.registry, context.runtime.package.data.manifest.name));
        for (const target of replacements.values()) {
            resources.push({ type: "DEVCLASS", name: target });
        }
        for (const previous of context.runtime.previousInstallPackages || []) {
            resources.push({ type: "DEVCLASS", name: previous.installDevclass });
        }
        const slots = [
            context.runtime.transports.devc,
            context.runtime.transports.tadir,
            context.runtime.transports.lang,
            ...(context.runtime.transports.cust || [])
        ].filter(Boolean);
        for (const slot of slots) {
            if (slot.binaries?.trkorr) {
                resources.push({ type: "TRANSPORT", name: slot.binaries.trkorr });
            }
            for (const entry of slot.binaries?.entries?.e071 || []) {
                const original = entry.objName.trim().toUpperCase();
                const target = entry.pgmid.trim().toUpperCase() === "R3TR" && entry.object.trim().toUpperCase() === "DEVC"
                    ? replacements.get(original) || original
                    : original;
                resources.push(objectLockResource({ ...entry, objName: target }));
                if (entry.pgmid.trim().toUpperCase() === "R3TR" && entry.object.trim().toUpperCase() === "DEVC") {
                    resources.push({ type: "DEVCLASS", name: target });
                }
            }
            for (const object of slot.binaries?.entries?.tadir || []) {
                const original = object.objName.trim().toUpperCase();
                const target = object.pgmid.trim().toUpperCase() === "R3TR" && object.object.trim().toUpperCase() === "DEVC"
                    ? replacements.get(original) || original
                    : original;
                resources.push(objectLockResource({ ...object, objName: target }));
            }
        }
        const root = context.runtime.package.hierarchy.devclass.trim().toUpperCase();
        resources.push({ type: "DEVCLASS", name: replacements.get(root) || root });
        await context.lockScope.acquire(resources);
    }
};
