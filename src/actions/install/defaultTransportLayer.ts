import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";

/**
 * Reads the system's default transport layer, used for transportable packages when the install
 * input doesn't specify one.
 */
export async function getDefaultTransportLayer(): Promise<string> {
    Logger.loading(`Checking transport layer...`);
    let defaultTransportLayer: string;
    try {
        defaultTransportLayer = await SystemConnector.getDefaultTransportLayer();
    } catch (e) {
        Logger.error(e.toString(), true);
        throw new Error(`Couldn't determine system's default transport layer.`);
    }
    if (!defaultTransportLayer) {
        throw new Error(`System has no default transport layer, specify one.`);
    }
    Logger.log(`System default transport layer: ${defaultTransportLayer}`, true);
    return defaultTransportLayer;
}
