import { E071 } from "../../../client";
import { Transport } from "../../../transport";

/**
 * Adds objects to a transport, one at a time when the batch call fails: SAP rejects the whole
 * request when one entry is invalid (e.g. its current package doesn't exist), and every other
 * object must still be added.
 */
export async function addObjectsResiliently(transport: Transport, entries: Pick<E071, 'pgmid' | 'object' | 'objName'>[]): Promise<{ failed: { entry: Pick<E071, 'pgmid' | 'object' | 'objName'>, error: unknown }[] }> {
    try {
        await transport.addObjects(entries, false);
        return { failed: [] };
    } catch (batchError) {
        const failed: { entry: Pick<E071, 'pgmid' | 'object' | 'objName'>, error: unknown }[] = [];
        for (const entry of entries) {
            try {
                await transport.addObjects([entry], false);
            } catch (entryError) {
                failed.push({ entry, error: entryError });
            }
        }
        return { failed };
    }
}
