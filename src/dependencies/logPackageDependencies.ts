import { Logger, TreeLog } from "trm-commons";
import chalk from "chalk";
import { RegistryType } from "../registry";
import { AbapPackageDependency, PackageDependencies, TrmPackageDependency } from "./PackageDependencies";

/**
 * A {@link TreeLog} node that also carries tabular data.
 * Text loggers print `text` as usual; loggers that understand it (e.g. the GUI) render a tree table:
 * a node with `columns` is a table whose rows are its children, each row's `cells` aligned with those columns.
 * A node with `layout: 'tabs'` shows each of its children as a separate tab.
 */
export type TreeTableLog = Omit<TreeLog, 'children'> & {
    layout?: 'tabs',
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

const TRM_COLUMNS = ['Name', 'Type', 'Version', 'Registry', 'Found in'];
const ABAP_COLUMNS = ['Name', 'Type', 'Found in'];

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function countObjects(foundIn: FoundIn): number {
    return new Set(foundIn.map(f => `${f.object} ${f.objName}`)).size;
}

function objectNodes(foundIn: FoundIn, columns: number): TreeTableLog[] {
    return foundIn.map(f => ({
        text: `${chalk.bold(f.object)} ${f.objName}`,
        cells: [f.objName, f.object, ...Array(columns - 2).fill('')],
        children: []
    }));
}

function trmPackageNode(o: TrmPackageDependency, trmFoundIn: boolean): TreeTableLog {
    const version = o.trmPackage.manifest ? `^${o.trmPackage.manifest.get().version}` : '';
    const registry = o.trmPackage.registry.getRegistryType() === RegistryType.PUBLIC ? 'public' : o.trmPackage.registry.endpoint;
    const objects = countObjects(o.foundIn);
    return {
        text: `${o.trmPackage.packageName}${version ? ` ${version}` : ''} (${registry})${trmFoundIn ? `, found in ${plural(objects, 'object')}` : ''}`,
        cells: [o.trmPackage.packageName, 'TRM package', version, registry, String(objects)],
        children: trmFoundIn ? objectNodes(o.foundIn, TRM_COLUMNS.length) : []
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
        children: [{
            text: `TRM Packages (${trmPackageDependencies.length})`,
            columns: TRM_COLUMNS,
            children: trmPackageDependencies.map(o => trmPackageNode(o, !!options.trmFoundIn))
        }, {
            text: `Customer packages (${custPackageDependencies.length})`,
            columns: ABAP_COLUMNS,
            children: custPackageDependencies.map(o => abapPackageNode(o, false))
        }]
    };
    if (options.sapEntries) {
        tree.children.push({
            text: `SAP packages (${sapPackageDependencies.length})`,
            columns: ABAP_COLUMNS,
            children: sapPackageDependencies.map(o => abapPackageNode(o, true))
        });
    } else if (sapPackageDependencies.length > 0) {
        tree.children.push({
            text: `SAP packages (${sapPackageDependencies.length})`,
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
