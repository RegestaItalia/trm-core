import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext, SapEntriesDependency } from ".";
import { Logger } from "trm-commons";
import { TADIR } from "../../client";
import { SenviParser } from "../../dependency";
import * as _ from "lodash";

const SAP_SOURCE_SYSTEMS = ['SAP'];
const SAP_AUTHORS = ['SAP'];

const _addEntry = (tableName: string, sapEntries: SapEntriesDependency[], dependencyIn: TADIR, dependency: any): SapEntriesDependency[] => {
    Logger.log(`Adding dependency to table ${tableName}, dependency in object ${JSON.stringify(dependencyIn)} with ${JSON.stringify(dependency)}`, true);
    var index = sapEntries.findIndex(o => o.table === tableName);
    if (index < 0) {
        index = sapEntries.push({
            table: tableName,
            dependencies: []
        });
        index--;
    }
    if (sapEntries[index].dependencies.find(o => _.isEqual(o.object, dependency))) {
        Logger.log(`Skipping, dependency with ${JSON.stringify(dependency)} already declared`, true);
    } else {
        sapEntries[index].dependencies.push({
            foundIn: dependencyIn,
            object: dependency
        });
    }
    return sapEntries;
}

/**
 * Parse repository environment result (SENVI)
 * 
 * 1- parse SENVI results
 * 
*/
export const parseSenvi: Step<FindDependenciesWorkflowContext> = {
    name: 'parse-senvi',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        Logger.log('Parse SENVI step', true);

        //1- parse SENVI results
        const senviObjects = context.runtime.repositoryEnvironment.senvi;
        const aIgnoredDevclass = context.runtime.packageData.ignoredTadir.filter(o => o.pgmid === 'R3TR' && o.object === 'DEVC').map(o => o.devclass);
        const senviParser = new SenviParser();
        var index: number = 0;
        Logger.loading(`Reading object dependencies...`);
        for (const senviObject of senviObjects) {
            index++;
            Logger.loading(`(${index}/${senviObjects.length}) Reading object dependencies...`);
            Logger.log(`Parsing SENVI of TADIR object ${senviObject.tadir.pgmid} ${senviObject.tadir.object} ${senviObject.tadir.objName}, ${senviObject.senvi} entries`, true);
            for (const senvi of senviObject.senvi) {
                Logger.loading(`Parsing SENVI object ${senvi.type} ${senvi.object} ${senvi.enclObj}...`, true);
                const parsedSenvi = await senviParser.parse(senvi);
                if (parsedSenvi && !aIgnoredDevclass.includes(parsedSenvi.devclass)) {
                    const dependency = {
                        'PGMID': parsedSenvi.pgmid,
                        'OBJECT': parsedSenvi.object,
                        'OBJ_NAME': parsedSenvi.objName,
                        'DEVCLASS': parsedSenvi.devclass
                    };
                    var subObject: {
                        table: string,
                        dependency: any
                    };
                    if (parsedSenvi.subObject) {
                        if (parsedSenvi.subObject.func) {
                            subObject = {
                                table: 'TFDIR',
                                dependency: {
                                    'FUNCNAME': parsedSenvi.subObject.func,
                                    'PNAME': `SAPL${parsedSenvi.objName}`
                                }
                            }
                        }
                    }
                    if (SAP_SOURCE_SYSTEMS.includes(parsedSenvi.srcsystem) || SAP_AUTHORS.includes(parsedSenvi.author)) {
                        Logger.log(`Dependency with SAP object ${parsedSenvi.pgmid} ${parsedSenvi.object} ${parsedSenvi.objName}, package ${parsedSenvi.devclass}`, true);
                        context.runtime.dependencies.sapObjects = _addEntry('TADIR', _.cloneDeep(context.runtime.dependencies.sapObjects), senviObject.tadir, dependency);
                        if (subObject) {
                            context.runtime.dependencies.sapObjects = _addEntry(subObject.table, _.cloneDeep(context.runtime.dependencies.sapObjects), senviObject.tadir, subObject.dependency);
                        }
                    } else {
                        Logger.log(`Dependency with custom object ${parsedSenvi.pgmid} ${parsedSenvi.object} ${parsedSenvi.objName}, package ${parsedSenvi.devclass}`, true);
                        context.runtime.dependencies.customObjects = _addEntry('TADIR', _.cloneDeep(context.runtime.dependencies.customObjects), senviObject.tadir, dependency);
                        if (subObject) {
                            context.runtime.dependencies.customObjects = _addEntry(subObject.table, _.cloneDeep(context.runtime.dependencies.customObjects), senviObject.tadir, subObject.dependency);
                        }
                    }
                } else {
                    Logger.log(`Skipping!`, true);
                }
            }
        }

    }
}