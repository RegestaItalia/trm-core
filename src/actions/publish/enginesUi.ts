import { QuestionUiColumn } from "trm-commons";
import {
    COMPONENT_NAME_REGEX,
    ENGINES_KEYS,
    ENGINES_TABLE_OPERATORS,
    ENGINES_TRM_PACKAGES,
    FIELD_NAME_REGEX,
    normalizeEngineName,
    normalizeNoteNumber,
    NOTE_REGEX,
    PRODUCT_NAME_REGEX,
    SapRangeMode,
    TABLE_NAME_REGEX,
    TABLE_VALUE_FORBIDDEN_REGEX,
    TABLE_VALUE_MAX_LENGTH,
    TrmManifestEngines,
    validateEngines,
    validSapRange,
    validTrmRange
} from "../../manifest";

type Row = Record<string, any>;

/**
 * Engines sections edited with a UI table.
 */
export type EnginesUiSection = 'trm' | 'components' | 'products' | 'notes' | 'tables';

/**
 * Engines split in UI table rows (see {@link enginesToUiRows}).
 */
export type EnginesUiRows = {
    trm: Row[],
    components: Row[],
    products: Row[],
    notes: Row[],
    tables: Row[],
    /**
     * edited as JSON
     */
    anyOf?: TrmManifestEngines[],
    /**
     * checks unknown to this version, kept untouched
     */
    other: Record<string, any>
};

//name of the nested table column and its properties, per versioned section
const VERSIONED_SECTIONS = {
    components: { nested: 'constraints', props: { release: 'release', sp: 'number' } as Record<string, SapRangeMode> },
    products: { nested: 'versions', props: { version: 'version' } as Record<string, SapRangeMode> }
};

function versionedToRows(section: 'components' | 'products', map: any): Row[] {
    const { nested, props } = VERSIONED_SECTIONS[section];
    return Object.keys(map || {}).map(name => {
        const value = map[name];
        if (value === false) {
            return { name, notInstalled: true };
        }
        const constraints = value === true ? [] : (Array.isArray(value) ? value : [value]);
        return {
            name,
            notInstalled: false,
            [nested]: constraints.map(constraint => {
                const row: Row = {};
                Object.keys(props).filter(prop => constraint?.[prop] !== undefined).forEach(prop => row[prop] = constraint[prop]);
                return row;
            })
        };
    });
}

function rowsToVersioned(section: 'components' | 'products', rows: Row[]): any {
    const { nested, props } = VERSIONED_SECTIONS[section];
    const map = {};
    (rows || []).forEach(row => {
        const constraints = (row[nested] || []).map(constraintRow => {
            const constraint = {};
            Object.keys(props).filter(prop => constraintRow[prop] !== undefined).forEach(prop => constraint[prop] = constraintRow[prop]);
            return constraint;
        });
        if (row.notInstalled) {
            map[row.name] = false;
        } else if (constraints.length === 0) {
            map[row.name] = true;
        } else {
            map[row.name] = constraints.length === 1 ? constraints[0] : constraints;
        }
    });
    return map;
}

function trmToRows(trm: any): Row[] {
    return Object.keys(trm || {}).map(name => ({ name, version: trm[name] }));
}

function rowsToTrm(rows: Row[]): any {
    const trm = {};
    (rows || []).forEach(row => {
        trm[row.name] = row.version;
    });
    return trm;
}

function notesToRows(notes: any): Row[] {
    return Object.keys(notes || {}).map(note => {
        const value = notes[note];
        return value === true || value?.version === undefined ? { note } : { note, version: value.version };
    });
}

function rowsToNotes(rows: Row[]): any {
    const notes = {};
    (rows || []).forEach(row => {
        notes[row.note] = row.version === undefined ? true : { version: row.version };
    });
    return notes;
}

function tablesToRows(tables: any): Row[] {
    return (Array.isArray(tables) ? tables : []).map(check => ({
        table: check?.table,
        where: (Array.isArray(check?.where) ? check.where : []).map(condition => {
            const row: Row = { field: condition?.field, value: condition?.value };
            if (condition?.op !== undefined) {
                row.op = String(condition.op).trim().toUpperCase();
            }
            return row;
        })
    }));
}

function rowsToTables(rows: Row[]): any {
    return (rows || []).map(row => ({
        table: row.table,
        where: (row.where || []).map(conditionRow => {
            const condition: Row = { field: conditionRow.field };
            if (conditionRow.op !== undefined) {
                condition.op = conditionRow.op;
            }
            condition.value = conditionRow.value;
            return condition;
        })
    }));
}

/**
 * Splits an engines declaration in UI table rows.
 * @param engines engines declaration
 */
export function enginesToUiRows(engines?: TrmManifestEngines): EnginesUiRows {
    const other = {};
    Object.keys(engines || {}).filter(key => !(ENGINES_KEYS as readonly string[]).includes(key)).forEach(key => other[key] = engines[key]);
    return {
        trm: trmToRows(engines?.trm),
        components: versionedToRows('components', engines?.components),
        products: versionedToRows('products', engines?.products),
        notes: notesToRows(engines?.notes),
        tables: tablesToRows(engines?.tables),
        anyOf: engines?.anyOf,
        other
    };
}

/**
 * Converts the rows of one UI table to its engines section.
 * @param section engines section
 * @param rows table rows
 */
export function uiRowsToEnginesSection(section: EnginesUiSection, rows: Row[]): any {
    switch (section) {
        case 'trm':
            return rowsToTrm(rows);
        case 'components':
        case 'products':
            return rowsToVersioned(section, rows);
        case 'notes':
            return rowsToNotes(rows);
        case 'tables':
            return rowsToTables(rows);
    }
}

/**
 * Builds an engines declaration from UI table rows. Empty sections are omitted.
 * @param rows table rows
 */
export function uiRowsToEngines(rows: EnginesUiRows): TrmManifestEngines {
    const engines: TrmManifestEngines = {};
    (['trm', 'components', 'products', 'notes', 'tables'] as const).forEach(section => {
        if (rows[section]?.length > 0) {
            engines[section] = uiRowsToEnginesSection(section, rows[section]);
        }
    });
    if (Array.isArray(rows.anyOf) && rows.anyOf.length > 0) {
        engines.anyOf = rows.anyOf;
    }
    return { ...engines, ...rows.other };
}

/**
 * Validates the rows of one UI table: duplicate names and the strict engines validation of the section.
 * @param section engines section
 * @param rows normalized table rows
 * @returns `true` if valid, otherwise the first error
 */
export function validateEnginesUiSection(section: EnginesUiSection, rows: Row[]): true | string {
    //an empty section is omitted from the engines
    if (!rows || rows.length === 0) {
        return true;
    }
    if (section !== 'tables') {
        const key = section === 'notes' ? 'note' : 'name';
        const seen: string[] = [];
        for (const row of rows || []) {
            const value = String(row[key] ?? '');
            const normalized = section === 'notes' ? normalizeNoteNumber(value) : section === 'trm' ? value : normalizeEngineName(value);
            if (seen.includes(normalized)) {
                return `Duplicate ${section === 'notes' ? 'SAP Note' : section === 'trm' ? 'TRM package' : section.slice(0, -1)} "${value}"`;
            }
            seen.push(normalized);
        }
    }
    const errors = validateEngines({ [section]: uiRowsToEnginesSection(section, rows) }, { strict: true });
    return errors.length === 0 ? true : errors[0];
}

function rangeColumn(name: string, label: string, mode: SapRangeMode, placeholder: string): QuestionUiColumn {
    return {
        name,
        label,
        placeholder,
        validate: (value) => validSapRange(String(value), mode) ? true : `Invalid range "${value}"`
    };
}

function nameColumn(regex: RegExp, placeholder: string): QuestionUiColumn {
    return {
        name: 'name',
        label: 'Name',
        required: true,
        case: 'upper',
        placeholder,
        validate: (value) => regex.test(normalizeEngineName(String(value))) ? true : 'Invalid name'
    };
}

function notInstalledColumn(nested: string): QuestionUiColumn {
    return {
        name: 'notInstalled',
        label: 'Not installed',
        type: 'boolean',
        validate: (value, row) => value === true && row[nested]?.length > 0 ? 'Remove the constraints of a component or product that must not be installed' : true
    };
}

/**
 * Columns of the UI table of each engines section.
 */
export const ENGINES_UI_COLUMNS: Record<EnginesUiSection, QuestionUiColumn[]> = {
    trm: [{
        name: 'name',
        label: 'Package',
        type: 'select',
        required: true,
        options: ENGINES_TRM_PACKAGES.map(name => ({ value: name }))
    }, {
        name: 'version',
        label: 'Version',
        required: true,
        placeholder: '>=9.0.0',
        validate: (value) => validTrmRange(value) ? true : `Invalid range "${value}"`
    }],
    components: [
        nameColumn(COMPONENT_NAME_REGEX, 'SAP_BASIS'),
        notInstalledColumn('constraints'),
        {
            name: 'constraints',
            label: 'Constraints (any)',
            type: 'table',
            columns: [
                rangeColumn('release', 'Release', 'release', '>=750'),
                rangeColumn('sp', 'SP', 'number', '>=5')
            ]
        }
    ],
    products: [
        nameColumn(PRODUCT_NAME_REGEX, 'ABAP PLATFORM'),
        notInstalledColumn('versions'),
        {
            name: 'versions',
            label: 'Versions (any)',
            type: 'table',
            columns: [
                rangeColumn('version', 'Version', 'version', '>=2022')
            ]
        }
    ],
    notes: [{
        name: 'note',
        label: 'SAP Note',
        required: true,
        placeholder: '3284711',
        validate: (value) => NOTE_REGEX.test(String(value)) && parseInt(value, 10) !== 0 ? true : 'Invalid SAP Note number'
    }, rangeColumn('version', 'Version', 'number', '>=5')],
    tables: [{
        name: 'table',
        label: 'Table',
        required: true,
        case: 'upper',
        maxLength: 30,
        validate: (value) => TABLE_NAME_REGEX.test(String(value)) ? true : 'Invalid table name'
    }, {
        name: 'where',
        label: 'Conditions (all)',
        type: 'table',
        required: true,
        columns: [{
            name: 'field',
            label: 'Field',
            required: true,
            case: 'upper',
            maxLength: 30,
            validate: (value) => FIELD_NAME_REGEX.test(String(value)) ? true : 'Invalid field name'
        }, {
            name: 'op',
            label: 'Operator',
            type: 'select',
            placeholder: 'EQ',
            options: ENGINES_TABLE_OPERATORS.map(op => ({ value: op }))
        }, {
            name: 'value',
            label: 'Value',
            required: true,
            maxLength: TABLE_VALUE_MAX_LENGTH,
            validate: (value) => TABLE_VALUE_FORBIDDEN_REGEX.test(String(value)) ? 'Value must not contain " AND " or " OR "' : true
        }]
    }]
};
