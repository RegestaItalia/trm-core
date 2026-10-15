import { Logger } from "trm-commons";
import { Transport } from "../../../transport";
import { TransportImportError } from "../../../transport/TransportImportError";
import { TransportBinary } from "../../../trmPackage";
import { SystemConnector } from "../../../systemConnector";
import { AbstractRegistry, DeleteTransportOptions, DeletionKey, DeletionObject } from "../../../registry";
import { resolveInstallRegistry } from "./installRegistry";
import { dequeueTransport } from "./importQueue";

/** What the client expects a deletion transport to delete, checked against what the registry reports. */
export type DeletionPreview = { e071: DeletionObject[], e071k: DeletionKey[] };

export type GenerateDeletionInput = {
    /** Registry of the action: a local (.trm) artifact generates its deletion through the registry it was published to. */
    registry: AbstractRegistry,
    /** Released transport of copies (a backup) whose content is deleted. */
    source: TransportBinary,
    /** Released dummy transport receiving the deletion. Default: the deletion keeps the source request. */
    dummy?: Transport,
    /** Registry transports of the incoming release: what they ship is never deleted. */
    subtract?: string[],
    /** Objects and customizing keys never deleted. */
    exclude?: DeleteTransportOptions['exclude'],
    /** Expected deletion: the registry must not delete anything outside it. */
    preview?: DeletionPreview,
    /** A legacy TRM backend has no test import. */
    legacyBackend?: boolean
};

function objectKey(object: DeletionObject): string {
    return `${object.pgmid.trim().toUpperCase()} ${object.object.trim().toUpperCase()} ${object.objName.trim().toUpperCase()}`;
}

function keyKey(key: DeletionKey): string {
    return `${key.table.trim().toUpperCase()} ${key.tabkey}`;
}

/** Client part of a customizing key: compared without it, as the backup and preview may come from different clients. */
function withoutClient(key: DeletionKey): string {
    return `${key.table.trim().toUpperCase()} ${key.tabkey.substring(3)}`;
}

function checkPreview(trkorr: string, preview: DeletionPreview, deleted: DeletionPreview): void {
    const objects = new Set(preview.e071.map(objectKey));
    const keys = new Set(preview.e071k.map(keyKey));
    const keysWithoutClient = new Set(preview.e071k.map(withoutClient));
    const unexpected = [
        ...deleted.e071.filter(object => !objects.has(objectKey(object))).map(objectKey),
        ...deleted.e071k.filter(key => !keys.has(keyKey(key)) && !keysWithoutClient.has(withoutClient(key))).map(key => `${key.table} ${key.tabkey}`)
    ];
    if (unexpected.length > 0) {
        const shown = unexpected.slice(0, 20);
        if (unexpected.length > shown.length) {
            shown.push(`...and ${unexpected.length - shown.length} more`);
        }
        Logger.error(`Deletion transport ${trkorr} would delete entries that were not confirmed:\n${shown.join('\n')}`, { important: true });
        throw new Error(`Deletion transport ${trkorr} doesn't match the confirmed deletion: nothing was deleted.`);
    }
    const notDeleted = preview.e071.length + preview.e071k.length - deleted.e071.length - deleted.e071k.length;
    if (notDeleted > 0) {
        Logger.log(`${notDeleted} previewed entries are not deleted by ${trkorr} (shipped again by the incoming release)`, true);
    }
}

/**
 * Generates a deletion transport through the registry, uploads it to the connected system and test-imports it.
 * It isn't imported: the caller imports it (alone, or in a batch).
 *
 * This is the only path that produces deletion transports: upgrades, uninstalls, rollbacks and staging cleanups
 * all go through it, so any improvement of the deletion reaches every flow.
 *
 * Returns `undefined` when nothing is left to delete: the dummy (if any) is then taken out of the import queue.
 * Throws `RegistryDeletionTransportUnavailableError` when the registry can't generate it.
 */
export async function generateDeletion(input: GenerateDeletionInput): Promise<Transport | undefined> {
    //a local artifact can't generate deletion transports: the registry it was published to does.
    const registry = await resolveInstallRegistry(input.registry);
    const options: DeleteTransportOptions = {};
    if (input.dummy) {
        options.target = input.dummy.trkorr;
    }
    if (input.subtract?.length > 0) {
        options.subtract = input.subtract;
    }
    if (input.exclude && ((input.exclude.e071 || []).length > 0 || (input.exclude.e071k || []).length > 0)) {
        options.exclude = input.exclude;
    }
    const trkorr = input.dummy?.trkorr || input.source.trkorr;
    Logger.loading(`Generating deletion transport ${trkorr}...`, true);
    const deletion = await registry.delete(input.source.binaries, Object.keys(options).length > 0 ? options : undefined);
    if (deletion.deleted) {
        Logger.log(`Deletion transport ${trkorr}: ${deletion.deleted.e071.length} objects, ${deletion.deleted.e071k.length} customizing keys`, true);
    }
    if (deletion.empty) {
        Logger.log(`Nothing to delete for ${trkorr}`, true);
        if (input.dummy) {
            await dequeueTransport(input.dummy.trkorr, 'deletion');
        }
        return undefined;
    }
    if (input.preview && deletion.deleted) {
        checkPreview(trkorr, input.preview, deletion.deleted);
    }

    Logger.loading(`Uploading transport...`);
    const transport = await Transport.upload(trkorr, {
        binary: deletion.binaries,
        trTarget: SystemConnector.getDest()
    });
    // A legacy backend has no test import; in the same process the RFC metadata of its import
    // function stays cached even after the upgrade is imported.
    if (input.legacyBackend) {
        Logger.log(`Skipping test import of ${trkorr}: legacy TRM backend`, true);
    } else {
        Logger.loading(`Testing import...`);
        const testRc = await transport.import(true);
        TransportImportError.assert(trkorr, testRc, `Test import of deletion transport`, transport.lastImportMessage);
    }
    return transport;
}
