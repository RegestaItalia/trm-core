import { Step } from "@simonegaffurini/sammarksworkflow";
import { Logger } from "trm-commons";
import { InstallWorkflowContext } from ".";
import { E071, TADIR } from "../../client";
import { LockResource, objectLockResource, packageLockResource } from "../commons/utils";
import { getInstallNamespace } from "./addNamespace";
import { checkObjectsLocks, findExistingObjects } from "./checkTransports";

function objectKey(object: { pgmid: string, object: string, objName: string }): string {
    return `${object.pgmid.trim().toUpperCase()} ${object.object.trim().toUpperCase()} ${object.objName.trim().toUpperCase()}`;
}

/**
 * Lock the selected import payload, its resolved target packages and its custom namespace before
 * dependencies mutate SAP, then repeat the safety checks of check-transports that another action
 * could have invalidated before the locks were held.
 */
export const lockResources: Step<InstallWorkflowContext> = {
    name: "lock-resources",
    run: async context => {
        const replacements = new Map(
            (context.rawInput.installData.installDevclass.replacements || [])
                .map(row => [row.originalDevclass.trim().toUpperCase(), row.installDevclass.trim().toUpperCase()])
        );
        const resources: LockResource[] = [];
        resources.push(packageLockResource(context.runtime.installRegistry, context.runtime.package.data.manifest.name));
        for (const target of replacements.values()) {
            resources.push({ type: "DEVCLASS", name: target });
        }
        for (const previous of context.runtime.previousInstallPackages || []) {
            resources.push({ type: "DEVCLASS", name: previous.installDevclass });
        }
        //a namespace held by a parent install stays locked until that install finishes
        const namespace = getInstallNamespace(context).trim().toUpperCase();
        const inheritedNamespaces = (context.inheritedNamespaceLocks || []).map(o => o.trim().toUpperCase());
        context.runtime.lockedNamespaces = [...inheritedNamespaces];
        if (namespace.startsWith('/') && !inheritedNamespaces.includes(namespace)) {
            resources.push({ type: "NAMESPACE", name: namespace });
            context.runtime.lockedNamespaces.push(namespace);
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

        //the checks ran before the locks were held: repeat those another action could invalidate
        const e071: E071[] = slots.flatMap(slot => slot.binaries?.entries?.e071 || []);
        const tadir: TADIR[] = slots.flatMap(slot => slot.binaries?.entries?.tadir || []);
        Logger.loading(`Checking objects locks...`, true);
        await checkObjectsLocks(e071);
        Logger.loading(`Checking objects existence...`, true);
        const accepted = new Set((context.runtime.existingObjects || []).map(objectKey));
        const appeared = (await findExistingObjects(context, tadir)).filter(o => !accepted.has(objectKey(o)));
        if (appeared.length > 0) {
            const noExistingObjects = context.rawInput.installData.checks?.noExistingObjects;
            appeared.forEach(o => {
                const message = `${o.pgmid} ${o.object} ${o.objName} was created on the target system during the install checks`;
                noExistingObjects ? Logger.warning(message, { important: true }) : Logger.error(message, { important: true });
            });
            if (!noExistingObjects) {
                throw new Error(`Install aborted: ${appeared.length} object(s) were created on the target system during the install checks.`);
            }
        }
    }
};
