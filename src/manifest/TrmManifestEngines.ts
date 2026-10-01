/**
 * Software component constraint (table CVERS).
 * - `true`: component must be installed
 * - `false`: component must NOT be installed
 * - object: component must be installed and match release/sp ranges
 * - array: at least one of the constraints must match
 */
export type TrmManifestEngineComponentConstraint = {
    release?: string,
    sp?: string
}

export type TrmManifestEngineComponent = boolean | TrmManifestEngineComponentConstraint | TrmManifestEngineComponentConstraint[];

/**
 * Product constraint (table PRDVERS, installed versions only).
 */
export type TrmManifestEngineProductConstraint = {
    version?: string
}

export type TrmManifestEngineProduct = boolean | TrmManifestEngineProductConstraint | TrmManifestEngineProductConstraint[];

/**
 * SAP Note constraint (tables CWBNTCUST/CWBNTHEAD).
 * - `true`: note must be completely implemented
 * - object: note must be completely implemented with a version matching the range
 */
export type TrmManifestEngineNoteConstraint = {
    version?: string
}

export type TrmManifestEngineNote = true | TrmManifestEngineNoteConstraint;

export type TrmManifestEngineTableOperator = 'EQ' | 'NE' | 'LT' | 'LE' | 'GT' | 'GE' | 'LIKE';

export type TrmManifestEngineTableCondition = {
    field: string,
    op?: TrmManifestEngineTableOperator,
    value: string
}

/**
 * Table check: at least one row matching all conditions must exist.
 */
export type TrmManifestEngineTableCheck = {
    table: string,
    where: TrmManifestEngineTableCondition[]
}

export type TrmManifestEngines = {
    components?: { [component: string]: TrmManifestEngineComponent },
    products?: { [product: string]: TrmManifestEngineProduct },
    notes?: { [note: string]: TrmManifestEngineNote },
    tables?: TrmManifestEngineTableCheck[],
    anyOf?: TrmManifestEngines[]
}
