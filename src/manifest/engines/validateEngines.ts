import { TrmManifestEngines } from "../TrmManifestEngines";
import { SapRangeMode, validSapRange } from "./sapRange";

export const ENGINES_KEYS = ['components', 'products', 'notes', 'tables', 'anyOf'] as const;
export const ENGINES_TABLE_OPERATORS = ['EQ', 'NE', 'LT', 'LE', 'GT', 'GE', 'LIKE'] as const;
export const ENGINES_MAX_ANYOF_DEPTH = 3;

export const COMPONENT_NAME_REGEX = /^[A-Z0-9_\/-]+$/;
export const PRODUCT_NAME_REGEX = /^[A-Z0-9_\/\-. ]+$/;
export const NOTE_REGEX = /^\d{1,10}$/;
export const TABLE_NAME_REGEX = /^[A-Z0-9_\/]{1,30}$/;
export const FIELD_NAME_REGEX = /^[A-Z0-9_\/]{1,30}$/;
//RFC_READ_TABLE option lines are limited to 72 characters (field + operator + quoted value)
export const TABLE_VALUE_MAX_LENGTH = 32;
//read table options are split on AND/OR operators
export const TABLE_VALUE_FORBIDDEN_REGEX = /\s(AND|OR)\s/i;

export type ValidateEnginesOptions = {
    /**
     * When true, unknown keys are reported as errors (use on publish).
     * When false, unknown keys are ignored (forward compatibility).
     */
    strict?: boolean
}

function isPlainObject(o: any): boolean {
    return typeof o === 'object' && o !== null && !Array.isArray(o);
}

export function normalizeEngineName(name: string): string {
    return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function normalizeNoteNumber(note: string | number): string {
    return parseInt(note.toString().trim(), 10).toString();
}

function checkConstraint(errors: string[], path: string, constraint: any, props: { [prop: string]: SapRangeMode }, strict: boolean, expected: string) {
    if (!isPlainObject(constraint)) {
        errors.push(`${path}: expected ${expected}.`);
        return;
    }
    Object.keys(constraint).forEach(prop => {
        const mode = props[prop];
        if (!mode) {
            if (strict) {
                errors.push(`${path}: unknown property "${prop}".`);
            }
            return;
        }
        if (typeof constraint[prop] !== 'string' || !validSapRange(constraint[prop], mode)) {
            errors.push(`${path}.${prop}: invalid range "${constraint[prop]}".`);
        }
    });
}

//keys are case and whitespace (names) or leading-zero (notes) insensitive: two keys normalizing to the same value would collapse
function checkDuplicate(errors: string[], path: string, seen: Map<string, string>, key: string, normalized: string) {
    if (seen.has(normalized)) {
        errors.push(`${path}: "${key}" duplicates "${seen.get(normalized)}".`);
    } else {
        seen.set(normalized, key);
    }
}

function checkVersionedMap(errors: string[], path: string, map: any, nameRegex: RegExp, props: { [prop: string]: SapRangeMode }, allowFalse: boolean, strict: boolean) {
    if (!isPlainObject(map)) {
        errors.push(`${path}: expected an object.`);
        return;
    }
    const seen = new Map<string, string>();
    Object.keys(map).forEach(name => {
        const itemPath = `${path}.${name}`;
        if (!nameRegex.test(normalizeEngineName(name))) {
            errors.push(`${itemPath}: invalid name.`);
        } else {
            checkDuplicate(errors, path, seen, name, normalizeEngineName(name));
        }
        const value = map[name];
        if (value === true || (value === false && allowFalse)) {
            return;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                errors.push(`${itemPath}: alternatives list is empty.`);
            }
            value.forEach((o, i) => checkConstraint(errors, `${itemPath}[${i}]`, o, props, strict, 'an object'));
        } else {
            checkConstraint(errors, itemPath, value, props, strict, `${allowFalse ? 'true, false' : 'true'}, an object or an array of objects`);
        }
    });
}

function checkNotes(errors: string[], path: string, notes: any, strict: boolean) {
    if (!isPlainObject(notes)) {
        errors.push(`${path}: expected an object.`);
        return;
    }
    const seen = new Map<string, string>();
    Object.keys(notes).forEach(note => {
        const itemPath = `${path}.${note}`;
        if (!NOTE_REGEX.test(note.trim()) || parseInt(note, 10) === 0) {
            errors.push(`${itemPath}: invalid SAP Note number.`);
        } else {
            checkDuplicate(errors, path, seen, note, normalizeNoteNumber(note));
        }
        const value = notes[note];
        if (value === true) {
            return;
        }
        checkConstraint(errors, itemPath, value, { version: 'number' }, strict, 'true or an object');
    });
}

function checkTables(errors: string[], path: string, tables: any, strict: boolean) {
    if (!Array.isArray(tables)) {
        errors.push(`${path}: expected an array.`);
        return;
    }
    tables.forEach((check, i) => {
        const itemPath = `${path}[${i}]`;
        if (!isPlainObject(check)) {
            errors.push(`${itemPath}: expected an object.`);
            return;
        }
        if (strict) {
            Object.keys(check).filter(k => k !== 'table' && k !== 'where').forEach(k => errors.push(`${itemPath}: unknown property "${k}".`));
        }
        if (typeof check.table !== 'string' || !TABLE_NAME_REGEX.test(check.table.trim().toUpperCase())) {
            errors.push(`${itemPath}.table: invalid table name.`);
        }
        if (!Array.isArray(check.where) || check.where.length === 0) {
            errors.push(`${itemPath}.where: expected a non-empty array of conditions.`);
            return;
        }
        check.where.forEach((condition, j) => {
            const conditionPath = `${itemPath}.where[${j}]`;
            if (!isPlainObject(condition)) {
                errors.push(`${conditionPath}: expected an object.`);
                return;
            }
            if (strict) {
                Object.keys(condition).filter(k => !['field', 'op', 'value'].includes(k)).forEach(k => errors.push(`${conditionPath}: unknown property "${k}".`));
            }
            if (typeof condition.field !== 'string' || !FIELD_NAME_REGEX.test(condition.field.trim().toUpperCase())) {
                errors.push(`${conditionPath}.field: invalid field name.`);
            }
            if (condition.op !== undefined && (typeof condition.op !== 'string' || !(ENGINES_TABLE_OPERATORS as readonly string[]).includes(condition.op.trim().toUpperCase()))) {
                errors.push(`${conditionPath}.op: invalid operator "${condition.op}", expected one of ${ENGINES_TABLE_OPERATORS.join(', ')}.`);
            }
            if ((typeof condition.value !== 'string' && typeof condition.value !== 'number') || condition.value.toString().length > TABLE_VALUE_MAX_LENGTH) {
                errors.push(`${conditionPath}.value: expected a string (max ${TABLE_VALUE_MAX_LENGTH} characters).`);
            } else if (TABLE_VALUE_FORBIDDEN_REGEX.test(condition.value.toString())) {
                errors.push(`${conditionPath}.value: must not contain " AND " or " OR ".`);
            }
        });
    });
}

function checkEngines(errors: string[], path: string, engines: any, depth: number, strict: boolean) {
    if (!isPlainObject(engines)) {
        errors.push(`${path}: expected an object.`);
        return;
    }
    Object.keys(engines).forEach(key => {
        const keyPath = `${path}.${key}`;
        switch (key) {
            case 'components':
                checkVersionedMap(errors, keyPath, engines.components, COMPONENT_NAME_REGEX, { release: 'release', sp: 'number' }, true, strict);
                break;
            case 'products':
                checkVersionedMap(errors, keyPath, engines.products, PRODUCT_NAME_REGEX, { version: 'version' }, true, strict);
                break;
            case 'notes':
                checkNotes(errors, keyPath, engines.notes, strict);
                break;
            case 'tables':
                checkTables(errors, keyPath, engines.tables, strict);
                break;
            case 'anyOf':
                if (depth >= ENGINES_MAX_ANYOF_DEPTH) {
                    errors.push(`${keyPath}: maximum nesting depth (${ENGINES_MAX_ANYOF_DEPTH}) exceeded.`);
                } else if (!Array.isArray(engines.anyOf) || engines.anyOf.length === 0) {
                    errors.push(`${keyPath}: expected a non-empty array.`);
                } else {
                    engines.anyOf.forEach((o, i) => checkEngines(errors, `${keyPath}[${i}]`, o, depth + 1, strict));
                }
                break;
            default:
                if (strict) {
                    errors.push(`${keyPath}: unknown engine check.`);
                }
        }
    });
}

/**
 * Formally validates a manifest engines declaration.
 * Returns the list of errors (empty when valid).
 */
export function validateEngines(engines: any, options?: ValidateEnginesOptions): string[] {
    const errors: string[] = [];
    checkEngines(errors, 'engines', engines, 0, !!options?.strict);
    return errors;
}

function normalizeConstraint(constraint: any): any {
    if (typeof constraint === 'boolean') {
        return constraint;
    }
    if (Array.isArray(constraint)) {
        return constraint.map(normalizeConstraint);
    }
    const normalized = {};
    Object.keys(constraint).forEach(prop => {
        normalized[prop] = typeof constraint[prop] === 'string' ? constraint[prop].trim().toUpperCase() : constraint[prop];
    });
    return normalized;
}

/**
 * Normalizes a (valid) engines declaration: uppercase names, note numbers without leading zeros,
 * default table operator `EQ`. Unknown keys are kept untouched.
 */
export function normalizeEngines(engines: TrmManifestEngines): TrmManifestEngines {
    const normalized: TrmManifestEngines = {};
    Object.keys(engines).forEach(key => {
        switch (key) {
            case 'components':
            case 'products':
                normalized[key] = {};
                Object.keys(engines[key]).forEach(name => {
                    normalized[key][normalizeEngineName(name)] = normalizeConstraint(engines[key][name]);
                });
                break;
            case 'notes':
                normalized.notes = {};
                Object.keys(engines.notes).forEach(note => {
                    normalized.notes[normalizeNoteNumber(note)] = normalizeConstraint(engines.notes[note]);
                });
                break;
            case 'tables':
                normalized.tables = engines.tables.map(check => ({
                    table: check.table.trim().toUpperCase(),
                    where: check.where.map(condition => ({
                        field: condition.field.trim().toUpperCase(),
                        op: (condition.op || 'EQ').trim().toUpperCase() as any,
                        value: condition.value.toString()
                    }))
                }));
                break;
            case 'anyOf':
                normalized.anyOf = engines.anyOf.map(normalizeEngines);
                break;
            default:
                normalized[key] = engines[key];
        }
    });
    return normalized;
}
