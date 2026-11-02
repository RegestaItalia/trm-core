import type { TelemetryProduct } from "trm-registry-types";
import type { CVERS } from "../client/struct";

/** Non-identifying characteristics of the connected SAP system: release levels, database and kernel. */
export interface SystemInfo {
    /** SAP_BASIS release, e.g. `758`. */
    basisRelease?: string,
    /** SAP_BASIS support package level, e.g. `0002`. */
    basisSp?: string,
    product?: TelemetryProduct,
    /** Release of the product core component (S4CORE, DW4CORE, SAP_APPL). */
    productRelease?: string,
    /** Support package level of the product core component. */
    productSp?: string,
    /** Database system, e.g. `HDB`. */
    dbSystem?: string,
    /** Kernel release, e.g. `793`. */
    kernelRelease?: string
}

// The first component found sets the product: S/4HANA and BW/4HANA also contain SAP_BASIS.
const PRODUCT_COMPONENTS: { component: string, product: TelemetryProduct }[] = [
    { component: 'S4CORE', product: 'S4HANA' },
    { component: 'DW4CORE', product: 'BW4HANA' },
    { component: 'SAP_APPL', product: 'ECC' },
    { component: 'SAP_BASIS', product: 'NETWEAVER' }
];

function level(value?: string): string | undefined {
    const trimmed = value?.trim().replace(/\s+/g, '_').toUpperCase();
    return trimmed ? trimmed : undefined;
}

/** Reads the SAP_BASIS and product levels from the software components (CVERS). */
export function getSystemInfoFromComponents(components: CVERS[]): SystemInfo {
    const byName = new Map((components || []).map(o => [o.component?.trim().toUpperCase(), o]));
    const info: SystemInfo = {};
    const basis = byName.get('SAP_BASIS');
    if (basis) {
        info.basisRelease = level(basis.release);
        info.basisSp = level(basis.extrelease);
    }
    const product = PRODUCT_COMPONENTS.find(o => byName.has(o.component));
    if (product) {
        const component = byName.get(product.component);
        info.product = product.product;
        info.productRelease = level(component.release);
        info.productSp = level(component.extrelease);
    }
    return info;
}

/** Normalizes a database system or kernel release (e.g. `ADABAS D` -> `ADABAS_D`). */
export function normalizeSystemLevel(value?: string): string | undefined {
    return level(value);
}
