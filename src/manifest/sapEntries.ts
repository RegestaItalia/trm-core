import { FIELD_NAME_REGEX, TABLE_NAME_REGEX, TABLE_VALUE_FORBIDDEN_REGEX } from "./engines";

//RFC_READ_TABLE option lines are limited to 72 characters, and a single condition cannot be split
export const SAP_ENTRY_CONDITION_MAX_LENGTH = 72;

/**
 * Builds the read-table conditions (`FIELD EQ 'value'`) identifying a required SAP entry.
 *
 * @throws When the entry is empty, a field name is invalid, a value is not a string or number,
 * contains " AND " or " OR ", or its condition exceeds one option line.
 */
export function getSapEntryConditions(sapEntry: any): string[] {
    if (typeof sapEntry !== 'object' || sapEntry === null || Array.isArray(sapEntry) || Object.keys(sapEntry).length === 0) {
        throw new Error(`SAP entry must be an object with at least one field.`);
    }
    return Object.keys(sapEntry).map(key => {
        const field = key.trim().toUpperCase();
        if (!FIELD_NAME_REGEX.test(field)) {
            throw new Error(`SAP entry field "${key}" is not a valid field name.`);
        }
        const value = sapEntry[key];
        if (typeof value !== 'string' && typeof value !== 'number') {
            throw new Error(`SAP entry field "${key}" must have a string or number value.`);
        }
        if (TABLE_VALUE_FORBIDDEN_REGEX.test(value.toString())) {
            throw new Error(`SAP entry field "${key}" value must not contain " AND " or " OR ".`);
        }
        const condition = `${field} EQ '${value.toString().replace(/'/g, "''")}'`;
        if (condition.length > SAP_ENTRY_CONDITION_MAX_LENGTH) {
            throw new Error(`SAP entry field "${key}" value is too long (condition exceeds ${SAP_ENTRY_CONDITION_MAX_LENGTH} characters).`);
        }
        return condition;
    });
}

/**
 * Validates a manifest `sapEntries` map.
 *
 * @returns One message per invalid table name or entry; empty when the declaration is valid.
 */
export function validateSapEntries(sapEntries: any): string[] {
    const errors: string[] = [];
    Object.keys(sapEntries).forEach(table => {
        if (!TABLE_NAME_REGEX.test(table.trim().toUpperCase())) {
            errors.push(`sapEntries.${table}: invalid table name.`);
        }
        if (!Array.isArray(sapEntries[table])) {
            errors.push(`sapEntries.${table}: expected an array.`);
            return;
        }
        sapEntries[table].forEach((entry, i) => {
            try {
                getSapEntryConditions(entry);
            } catch (e) {
                errors.push(`sapEntries.${table}[${i}]: ${e.message}`);
            }
        });
    });
    return errors;
}
