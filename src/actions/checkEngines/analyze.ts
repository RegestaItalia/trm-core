import { Step } from "@simonegaffurini/sammarksworkflow";
import { CheckEnginesWorkflowContext, EngineCheckResult } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { ENGINES_COMPONENT_PROPS, ENGINES_NOTE_PROPS, ENGINES_PRODUCT_PROPS, ENGINES_TABLE_CONDITION_PROPS, ENGINES_TABLE_PROPS, normalizeSapValue, satisfiesSapRange, TrmManifestEngineComponentConstraint, TrmManifestEngineProductConstraint, TrmManifestEngines, TrmManifestEngineTableCheck } from "../../manifest";
import { CVERS, PRDVERS } from "../../client/struct";

//note implementation statuses (CWBNTCUST-PRSTATUS)
const NOTE_IMPLEMENTED = 'E';
const NOTE_OBSOLETE = 'O'; //correction already contained in the support package level

type Requirement = {
    requirement: string,
    actual?: string,
    ok: boolean,
    reason?: string
}

function errorMessage(e: any): string {
    return e instanceof Error ? e.message : String(e);
}

function getUnsupportedProps(o: object, supported: readonly string[]): string[] {
    return Object.keys(o).filter(k => !supported.includes(k));
}

//a property this TRM version doesn't know can't be verified, so the constraint declaring it never matches
function unsupportedReason(props: string[]): string | undefined {
    const unique = Array.from(new Set(props));
    if (unique.length === 0) {
        return undefined;
    }
    return `Unsupported ${unique.length === 1 ? 'property' : 'properties'} ${unique.map(o => `"${o}"`).join(', ')}, update TRM to verify ${unique.length === 1 ? 'it' : 'them'}`;
}

function describeConstraints(constraints: object[]): string {
    return constraints.map(o => {
        const parts = Object.keys(o).map(k => `${k} ${o[k]}`);
        return parts.length > 0 ? parts.join(', ') : 'installed';
    }).join(' || ');
}

//the read is cached as a promise, so a failed read is not retried for every requirement
function getComponents(context: CheckEnginesWorkflowContext): Promise<CVERS[]> {
    if (!context.runtime.components) {
        context.runtime.components = SystemConnector.getSoftwareComponents();
    }
    return context.runtime.components;
}

function getProducts(context: CheckEnginesWorkflowContext): Promise<PRDVERS[]> {
    if (!context.runtime.products) {
        context.runtime.products = SystemConnector.getInstalledProducts();
    }
    return context.runtime.products;
}

//a blank CVERS-EXTRELEASE means no support package is installed (level 0)
function getComponentSp(component: CVERS): string {
    const extrelease = (component.extrelease || '').trim() || '0';
    return normalizeSapValue(extrelease, 'number') ?? extrelease;
}

function matchComponent(component: CVERS, constraint: TrmManifestEngineComponentConstraint): boolean {
    if (constraint.release !== undefined && !satisfiesSapRange(component.release, constraint.release, 'release')) {
        return false;
    }
    if (constraint.sp !== undefined && !satisfiesSapRange(getComponentSp(component), constraint.sp, 'number')) {
        return false;
    }
    return true;
}

async function checkComponent(context: CheckEnginesWorkflowContext, name: string, value: any): Promise<Requirement> {
    const requirement = value === true ? 'installed' : value === false ? 'not installed' : describeConstraints(Array.isArray(value) ? value : [value]);
    var components: CVERS[];
    try {
        components = await getComponents(context);
    } catch (e) {
        return { requirement, ok: false, reason: `Cannot read software components: ${errorMessage(e)}` };
    }
    const component = components.find(o => o.component.trim().toUpperCase() === name);
    const actual = component ? `release ${component.release}, sp ${getComponentSp(component)}` : 'not installed';
    if (value === false) {
        return { requirement, actual, ok: !component };
    }
    if (!component) {
        return { requirement, actual, ok: false };
    }
    if (value === true) {
        return { requirement, actual, ok: true };
    }
    const constraints: TrmManifestEngineComponentConstraint[] = Array.isArray(value) ? value : [value];
    const unsupported = constraints.map(o => getUnsupportedProps(o, Object.keys(ENGINES_COMPONENT_PROPS)));
    const ok = constraints.some((o, i) => unsupported[i].length === 0 && matchComponent(component, o));
    return { requirement, actual, ok, reason: ok ? undefined : unsupportedReason(unsupported.flat()) };
}

async function checkProduct(context: CheckEnginesWorkflowContext, name: string, value: any): Promise<Requirement> {
    const requirement = value === true ? 'installed' : value === false ? 'not installed' : describeConstraints(Array.isArray(value) ? value : [value]);
    var products: PRDVERS[];
    try {
        products = await getProducts(context);
    } catch (e) {
        return { requirement, ok: false, reason: `Cannot read products: ${errorMessage(e)}` };
    }
    const installed = products.filter(o => o.name.trim().toUpperCase().replace(/\s+/g, ' ') === name);
    const actual = installed.length > 0 ? `version ${installed.map(o => o.version).join(', ')}` : 'not installed';
    if (value === false) {
        return { requirement, actual, ok: installed.length === 0 };
    }
    if (value === true) {
        return { requirement, actual, ok: installed.length > 0 };
    }
    const constraints: TrmManifestEngineProductConstraint[] = Array.isArray(value) ? value : [value];
    const unsupported = constraints.map(o => getUnsupportedProps(o, Object.keys(ENGINES_PRODUCT_PROPS)));
    const ok = installed.some(product => constraints.some((o, i) => unsupported[i].length === 0 && (o.version === undefined || satisfiesSapRange(product.version, o.version, 'version'))));
    return { requirement, actual, ok, reason: ok ? undefined : unsupportedReason(unsupported.flat()) };
}

async function checkNote(note: string, value: any): Promise<Requirement> {
    const requirement = value === true || value.version === undefined ? 'implemented' : `implemented, version ${value.version}`;
    const unsupported = unsupportedReason(value === true ? [] : getUnsupportedProps(value, Object.keys(ENGINES_NOTE_PROPS)));
    if (unsupported) {
        return { requirement, ok: false, reason: unsupported };
    }
    var status: { prstatus?: string, versno?: string };
    try {
        status = await SystemConnector.getNoteStatus(note);
    } catch (e) {
        return { requirement, ok: false, reason: `Cannot read SAP Note status: ${errorMessage(e)}` };
    }
    if (status.prstatus === NOTE_OBSOLETE) {
        return { requirement, actual: 'obsolete (contained in support package)', ok: true };
    }
    if (status.prstatus !== NOTE_IMPLEMENTED) {
        return { requirement, actual: status.prstatus === undefined ? 'not downloaded' : `status ${status.prstatus || 'undefined'}`, ok: false };
    }
    const actual = `implemented, version ${parseInt(status.versno, 10) || '?'}`;
    if (value === true || value.version === undefined) {
        return { requirement, actual, ok: true };
    }
    return { requirement, actual, ok: status.versno !== undefined && satisfiesSapRange(status.versno, value.version, 'number') };
}

async function checkTable(check: TrmManifestEngineTableCheck): Promise<Requirement> {
    const requirement = `${check.table} where ${check.where.map(o => `${o.field} ${o.op || 'EQ'} '${o.value}'`).join(' AND ')}`;
    const unsupported = unsupportedReason([
        ...getUnsupportedProps(check, ENGINES_TABLE_PROPS),
        ...check.where.flatMap(o => getUnsupportedProps(o, ENGINES_TABLE_CONDITION_PROPS))
    ]);
    if (unsupported) {
        return { requirement, ok: false, reason: unsupported };
    }
    try {
        const exists = await SystemConnector.checkTableCondition(check.table, check.where);
        return { requirement, actual: exists ? 'found' : 'not found', ok: exists };
    } catch (e) {
        return { requirement, ok: false, reason: `Cannot read table ${check.table}: ${errorMessage(e)}` };
    }
}

async function evaluate(context: CheckEnginesWorkflowContext, engines: TrmManifestEngines, path: string, required: boolean): Promise<{ ok: boolean, results: EngineCheckResult[] }> {
    const results: EngineCheckResult[] = [];
    const push = (itemPath: string, o: Requirement) => {
        results.push({ path: itemPath, required, ...o });
        return o.ok;
    };
    const prefix = path ? `${path}.` : '';
    var ok = true;
    for (const key of Object.keys(engines)) {
        switch (key) {
            case 'components':
                for (const name of Object.keys(engines.components)) {
                    ok = push(`${prefix}components.${name}`, await checkComponent(context, name, engines.components[name])) && ok;
                }
                break;
            case 'products':
                for (const name of Object.keys(engines.products)) {
                    ok = push(`${prefix}products.${name}`, await checkProduct(context, name, engines.products[name])) && ok;
                }
                break;
            case 'notes':
                for (const note of Object.keys(engines.notes)) {
                    ok = push(`${prefix}notes.${note}`, await checkNote(note, engines.notes[note])) && ok;
                }
                break;
            case 'tables':
                for (var i = 0; i < engines.tables.length; i++) {
                    ok = push(`${prefix}tables[${i}]`, await checkTable(engines.tables[i])) && ok;
                }
                break;
            case 'anyOf':
                var alternatives: EngineCheckResult[] = [];
                var anyOk = false;
                for (var j = 0; j < engines.anyOf.length; j++) {
                    const alternative = await evaluate(context, engines.anyOf[j], `${prefix}anyOf[${j}]`, false);
                    alternatives = alternatives.concat(alternative.results);
                    anyOk = anyOk || alternative.ok;
                }
                ok = push(`${prefix}anyOf`, {
                    requirement: `at least 1 of ${engines.anyOf.length} alternatives`,
                    actual: anyOk ? 'satisfied' : 'no alternative satisfied',
                    ok: anyOk
                }) && ok;
                results.push(...alternatives);
                break;
            default:
                ok = push(`${prefix}${key}`, {
                    requirement: key,
                    ok: false,
                    reason: `Unsupported engine check "${key}", update TRM to verify it`
                }) && ok;
        }
    }
    return { ok, results };
}

/**
 * Workflow step that evaluates the engines declaration against the connected system.
 *
 * 1- evaluate engines
 *
 * 2- print table
 *
*/
export const analyze: Step<CheckEnginesWorkflowContext> = {
    name: 'analyze',
    filter: async (context: CheckEnginesWorkflowContext): Promise<boolean> => {
        if (Object.keys(context.output.engines).length > 0) {
            return true;
        } else {
            Logger.info(`Package ${context.rawInput.packageData.manifest.name} has no engines`, !context.rawInput.printOptions.information);
            return false;
        }
    },
    run: async (context: CheckEnginesWorkflowContext): Promise<void> => {
        //1- evaluate engines
        const evaluation = await evaluate(context, context.output.engines, '', true);
        context.output.passed = evaluation.ok;
        context.output.results = evaluation.results;
        const failed = evaluation.results.filter(o => o.required && !o.ok).length;
        Logger.info(`Package ${context.rawInput.packageData.manifest.name} engines: ${evaluation.results.filter(o => o.required).length - failed} satisfied, ${failed} not satisfied`, !context.rawInput.printOptions.information);

        //2- print table
        Logger.table(['Requirement', 'Expected', 'Actual', 'Status'], evaluation.results.map(o => [
            o.path,
            o.requirement,
            o.reason || o.actual || '',
            o.ok ? 'OK' : o.required ? 'NOT MET' : 'NOT MET (alternative)'
        ]), !context.rawInput.printOptions.enginesStatus);
    }
}
