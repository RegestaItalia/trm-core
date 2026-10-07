import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { compareSapValues, normalizeSapValue, TrmManifestEngineComponent, TrmManifestEngines } from "../../manifest";

//CVERS-COMP_TYPE of components that are not delivered by SAP (local, home, customer)
const EXCLUDED_COMPONENT_TYPES = ['L', 'M', 'J', 'K'];

/** Example engines used when the system can't be read (formally invalid on purpose: must be edited). */
export const ENGINES_TEMPLATE = {
    components: {
        '<<COMPONENT>>': {
            release: '<<release range>>',
            sp: '<<sp range>>'
        }
    }
};

/**
 * Builds an engines declaration from the connected system: each SAP software component
 * as "this release at this SP or newer, or any newer release", and each installed product as "this version or newer".
 *
 * SAP Notes and table checks can't be inferred and are never included.
 *
 * @returns Engines declaration, or {@link ENGINES_TEMPLATE} if the system can't be read.
 */
export async function getSystemEngines(): Promise<TrmManifestEngines> {
    try {
        const engines: TrmManifestEngines = {
            components: {},
            products: {}
        };
        //a malformed row is skipped on its own, without discarding the rest of the prefill
        for (const component of await SystemConnector.getSoftwareComponents()) {
            try {
                const name = component.component.trim().toUpperCase();
                const release = normalizeSapValue(component.release, 'release');
                if (!name || !release || release === 'DEV' || EXCLUDED_COMPONENT_TYPES.includes(component.compType)) {
                    continue;
                }
                const sp = normalizeSapValue(component.extrelease, 'number') || '0';
                const constraint: TrmManifestEngineComponent = [
                    { release, sp: `>=${sp}` },
                    { release: `>${release}` }
                ];
                engines.components[name] = constraint;
            } catch (e) {
                Logger.warning(`Skipping software component ${JSON.stringify(component)}: ${e}`, true);
            }
        }
        const productVersions: { [name: string]: string } = {};
        for (const product of await SystemConnector.getInstalledProducts()) {
            try {
                const name = product.name.trim().toUpperCase().replace(/\s+/g, ' ');
                const version = normalizeSapValue(product.version, 'version');
                if (!name || !version) {
                    continue;
                }
                if (!productVersions[name] || compareSapValues(version, productVersions[name], 'version') > 0) {
                    productVersions[name] = version;
                }
            } catch (e) {
                Logger.warning(`Skipping installed product ${JSON.stringify(product)}: ${e}`, true);
            }
        }
        Object.keys(productVersions).forEach(name => {
            engines.products[name] = { version: `>=${productVersions[name]}` };
        });
        if (Object.keys(engines.components).length === 0) {
            delete engines.components;
        }
        if (Object.keys(engines.products).length === 0) {
            delete engines.products;
        }
        return Object.keys(engines).length > 0 ? engines : ENGINES_TEMPLATE;
    } catch (e) {
        Logger.error(e.toString(), true);
        Logger.warning(`Couldn't read system components and products, engines will not be prefilled.`);
        return ENGINES_TEMPLATE;
    }
}
