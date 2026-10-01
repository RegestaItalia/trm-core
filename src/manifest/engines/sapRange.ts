/**
 * SAP-aware version ranges, used by manifest engines.
 *
 * Syntax (semver-like):
 * - comparator: `>=`, `>`, `<=`, `<`, `=` or none (exact match), followed by a value
 * - comparators separated by whitespace must all match (AND)
 * - comparator sets separated by `||` are alternatives (OR)
 *
 * Comparison modes:
 * - `release`: software component release (e.g. `758`, `75I`, `2020`). Numeric when both values
 *   are digits only, otherwise character-wise (0-9 < A-Z) when both values have the same length.
 *   Values that can't be compared never satisfy the comparator.
 * - `version`: dotted numeric version (e.g. product version `7.52`, `2023`)
 * - `number`: integer (e.g. support package level, SAP Note version)
 */
export type SapRangeMode = 'release' | 'version' | 'number';

type SapRangeOperator = '>=' | '>' | '<=' | '<' | '=';

type SapRangeComparator = {
    operator: SapRangeOperator,
    value: string
}

const VALUE_PATTERNS: { [mode in SapRangeMode]: RegExp } = {
    release: /^[0-9A-Z]+$/,
    version: /^\d+(\.\d+)*$/,
    number: /^\d+$/
};

const COMPARATOR_REGEX = /^(>=|<=|>|<|=)?(.+)$/;

function parseSapRange(range: string, mode: SapRangeMode): SapRangeComparator[][] {
    if (typeof range !== 'string') {
        throw new Error(`Range must be a string.`);
    }
    const sets = range.split('||').map(set => {
        //allow a space between operator and value (">= 750")
        const tokens = set.trim().toUpperCase().replace(/(>=|<=|>|<|=)\s+/g, '$1').split(/\s+/).filter(t => t);
        if (tokens.length === 0) {
            throw new Error(`Empty comparator set in range "${range}".`);
        }
        return tokens.map(token => {
            const match = COMPARATOR_REGEX.exec(token);
            const value = match[2];
            if (!VALUE_PATTERNS[mode].test(value)) {
                throw new Error(`Invalid value "${value}" in range "${range}".`);
            }
            return {
                operator: (match[1] || '=') as SapRangeOperator,
                value
            };
        });
    });
    return sets;
}

function compareVersion(a: string, b: string): number {
    const aParts = a.split('.').map(p => parseInt(p, 10));
    const bParts = b.split('.').map(p => parseInt(p, 10));
    const length = Math.max(aParts.length, bParts.length);
    for (var i = 0; i < length; i++) {
        const diff = (aParts[i] || 0) - (bParts[i] || 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

/**
 * Compares two values according to mode.
 * Returns a negative number, zero or a positive number, or `undefined` when values can't be compared.
 */
export function compareSapValues(a: string, b: string, mode: SapRangeMode): number | undefined {
    a = normalizeSapValue(a, mode);
    b = normalizeSapValue(b, mode);
    if (a === undefined || b === undefined) {
        return undefined;
    }
    switch (mode) {
        case 'number':
            return parseInt(a, 10) - parseInt(b, 10);
        case 'version':
            return compareVersion(a, b);
        case 'release':
            if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
                return parseInt(a, 10) - parseInt(b, 10);
            }
            if (a.length !== b.length) {
                return undefined;
            }
            return a < b ? -1 : a > b ? 1 : 0;
    }
}

/**
 * Normalizes a value read from the system (e.g. CVERS-EXTRELEASE `0000000002`) or declared in a range.
 * Returns `undefined` when the value is not valid for mode.
 */
export function normalizeSapValue(value: string | number, mode: SapRangeMode): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const sValue = value.toString().trim().toUpperCase();
    if (!VALUE_PATTERNS[mode].test(sValue)) {
        return undefined;
    }
    if (mode === 'number') {
        return parseInt(sValue, 10).toString();
    }
    return sValue;
}

export function validSapRange(range: string, mode: SapRangeMode): boolean {
    try {
        parseSapRange(range, mode);
        return true;
    } catch (e) {
        return false;
    }
}

export function satisfiesSapRange(value: string | number, range: string, mode: SapRangeMode): boolean {
    const sets = parseSapRange(range, mode);
    const sValue = normalizeSapValue(value, mode);
    if (sValue === undefined) {
        return false;
    }
    return sets.some(set => set.every(comparator => {
        const result = compareSapValues(sValue, comparator.value, mode);
        if (result === undefined) {
            return false;
        }
        switch (comparator.operator) {
            case '>=': return result >= 0;
            case '>': return result > 0;
            case '<=': return result <= 0;
            case '<': return result < 0;
            case '=': return result === 0;
        }
    }));
}

export type SapSupportPackage = {
    release: string,
    sp: number,
    component?: string
}

/**
 * Parses a support package name, e.g. `SAPK-75017INSAPUI` -> release `750`, sp `17`, component `SAPUI`.
 * Also accepts the short form `SAPKB75017` (component not derivable).
 */
export function parseSupportPackage(supportPackage: string): SapSupportPackage | undefined {
    const match = /^SAPK[A-Z-]([0-9A-Z]{3})(\d{2})(?:IN([0-9A-Z_]+))?$/.exec((supportPackage || '').trim().toUpperCase());
    if (!match) {
        return undefined;
    }
    return {
        release: match[1],
        sp: parseInt(match[2], 10),
        component: match[3]
    };
}
