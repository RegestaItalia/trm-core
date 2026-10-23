import { Logger, TreeLog } from "trm-commons";
import chalk from "chalk";
import { RegistryType } from "../registry";
import { AbapPackageDependency, PackageDependencies, TrmPackageDependency } from "./PackageDependencies";

/**
 * A {@link TreeLog} node that also carries tabular data.
 * Text loggers print `text` as usual; loggers that understand it (e.g. the GUI) render a tree table:
 * a node with `columns` is a table whose rows are its children, each row's `cells` aligned with those columns.
 * A node with `layout: 'tabs'` shows each of its children as a separate tab.
 * `info` explains how to read the node (the whole tree or a tab); paragraphs are separated by blank lines.
 */
export type TreeTableLog = Omit<TreeLog, 'children'> & {
    layout?: 'tabs',
    info?: string,
    columns?: string[],
    cells?: string[],
    children?: TreeTableLog[]
}

export type PackageDependenciesLogOptions = {
    /** Include the SAP packages entries; without it they're only counted. */
    sapEntries?: boolean,
    /** Include the objects referencing each TRM package dependency. */
    trmFoundIn?: boolean
}

type FoundIn = { object: string, objName: string }[];
type References = TrmPackageDependency['foundIn'][number]['references'];

const TRM_COLUMNS = ['Name', 'Type', 'Version', 'Registry', 'Found in'];
const TRM_LEVELS_INFO = 'Expand a package to see the objects using it, and an object to see what it uses from the TRM package.';
const ABAP_COLUMNS = ['Name', 'Type', 'Found in'];
const ABAP_LEVELS_INFO = 'Rows are nested as package > table > entry > objects: an entry is the key of the table row the dependency points to (e.g. the TADIR entry of an object), the objects are the ones using it.';
const CUSTOMER_PACKAGES_INFO = `Customer packages that are not TRM packages. ${ABAP_LEVELS_INFO}\n\nA package with these dependencies can't be published: publish them as TRM packages or remove the dependency.`;
const SAP_PACKAGES_INFO = `SAP standard packages. ${ABAP_LEVELS_INFO}\n\nWhen publishing, the entries are added to the manifest SAP entries and are checked on the target system before install.`;

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function countObjects(foundIn: FoundIn): number {
    return new Set(foundIn.map(f => `${f.object} ${f.objName}`)).size;
}

function objectNode(f: FoundIn[number], columns: number, children: TreeTableLog[] = []): TreeTableLog {
    return {
        text: `${chalk.bold(f.object)} ${f.objName}`,
        cells: [f.objName, f.object, ...Array(columns - 2).fill('')],
        children
    };
}

function objectNodes(foundIn: FoundIn, columns: number): TreeTableLog[] {
    return foundIn.map(f => objectNode(f, columns));
}

/** A TADIR entry is shown as the object it identifies, any other entry as its table key. */
function referenceNodes(references: References, columns: number): TreeTableLog[] {
    return references.map(r => {
        const key = r.tableKey || {};
        const isObject = r.tableName === 'TADIR' && key.OBJECT && key.OBJ_NAME;
        const name = isObject ? String(key.OBJ_NAME).trim() : Object.entries(key).map(([k, v]) => `${k}: ${String(v).trim()}`).join(', ');
        const type = isObject ? String(key.OBJECT).trim() : r.tableName;
        return {
            text: `uses ${chalk.bold(type)} ${name}`,
            cells: [name, type, ...Array(columns - 2).fill('')],
            children: []
        };
    });
}

function trmPackageNode(o: TrmPackageDependency, trmFoundIn: boolean): TreeTableLog {
    const version = o.trmPackage.manifest ? `^${o.trmPackage.manifest.get().version}` : '';
    const registry = o.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : o.trmPackage.registry.endpoint;
    const objects = countObjects(o.foundIn);
    return {
        text: `${o.trmPackage.packageName}${version ? ` ${version}` : ''} (${registry})${trmFoundIn ? `, found in ${plural(objects, 'object')}` : ''}`,
        cells: [o.trmPackage.packageName, 'TRM package', version, registry, String(objects)],
        children: trmFoundIn ? o.foundIn.map(f => objectNode(f, TRM_COLUMNS.length, referenceNodes(f.references || [], TRM_COLUMNS.length))) : []
    };
}

function abapPackageNode(o: AbapPackageDependency, underlineTables: boolean): TreeTableLog {
    const keys = o.entries.reduce((sum, entry) => sum + entry.dependency.length, 0);
    const packageFoundIn = o.entries.flatMap(t => t.dependency.flatMap(k => k.foundIn));
    return {
        text: `${o.abapPackage.devclass} (${keys})`,
        cells: [o.abapPackage.devclass, 'Package', String(countObjects(packageFoundIn))],
        children: o.entries.map(t => {
            const tableFoundIn = t.dependency.flatMap(k => k.foundIn);
            return {
                text: underlineTables ? chalk.underline(t.tableName) : t.tableName,
                cells: [t.tableName, 'Table', String(countObjects(tableFoundIn))],
                children: t.dependency.map(k => {
                    const entries = Object.entries(k.tableKey || {});
                    return {
                        text: `${entries.map(([key, value]) => `${chalk.bold(key)}: ${value}`).join(', ')}, found in ${plural(countObjects(k.foundIn), 'object')}`,
                        cells: [entries.map(([key, value]) => `${key}: ${value}`).join(', '), 'Entry', String(countObjects(k.foundIn))],
                        children: objectNodes(k.foundIn, ABAP_COLUMNS.length)
                    };
                })
            };
        })
    };
}

/**
 * Builds the dependencies of an ABAP package as a tree with one branch (tab) per category:
 * TRM packages, customer packages and SAP packages.
 */
export function getPackageDependenciesTree(dependencies: PackageDependencies, options: PackageDependenciesLogOptions = {}): TreeTableLog {
    const trmPackageDependencies = dependencies.trmPackageDependencies;
    const sapPackageDependencies = dependencies.abapPackageDependencies.filter(o => !o.isCustomerPackage);
    const custPackageDependencies = dependencies.abapPackageDependencies.filter(o => o.isCustomerPackage);
    const tree: TreeTableLog = {
        text: `${chalk.bold(dependencies.devclass)} dependencies`,
        layout: 'tabs',
        info: `What the objects of package ${dependencies.devclass} and its subpackages use from outside of it, one tab per kind of dependency.\n\n"Found in" is the number of distinct objects of ${dependencies.devclass} that use the row.`,
        children: [{
            text: `TRM Packages (${trmPackageDependencies.length})`,
            info: `TRM packages installed on the system whose objects are used. When publishing, they are added to the manifest dependencies with the version range shown.${options.trmFoundIn ? ` ${TRM_LEVELS_INFO}` : ''}`,
            columns: TRM_COLUMNS,
            children: trmPackageDependencies.map(o => trmPackageNode(o, !!options.trmFoundIn))
        }, {
            text: `Customer packages (${custPackageDependencies.length})`,
            info: CUSTOMER_PACKAGES_INFO,
            columns: ABAP_COLUMNS,
            children: custPackageDependencies.map(o => abapPackageNode(o, false))
        }]
    };
    if (options.sapEntries) {
        tree.children.push({
            text: `SAP packages (${sapPackageDependencies.length})`,
            info: SAP_PACKAGES_INFO,
            columns: ABAP_COLUMNS,
            children: sapPackageDependencies.map(o => abapPackageNode(o, true))
        });
    } else if (sapPackageDependencies.length > 0) {
        tree.children.push({
            text: `SAP packages (${sapPackageDependencies.length})`,
            info: SAP_PACKAGES_INFO,
            columns: ABAP_COLUMNS,
            children: [{
                text: `Run with flag --sap-entries to view dependencies`,
                cells: ['Run with SAP entries to view dependencies', '', ''],
                children: []
            }]
        });
    }
    return tree;
}

/** Logs the dependencies of an ABAP package as a tree, see {@link getPackageDependenciesTree}. */
export function logPackageDependencies(dependencies: PackageDependencies, options: PackageDependenciesLogOptions = {}): void {
    Logger.tree(getPackageDependenciesTree(dependencies, options));
}
