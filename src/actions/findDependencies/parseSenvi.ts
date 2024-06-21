import { Step } from "@simonegaffurini/sammarksworkflow";
import { FindDependenciesWorkflowContext, SapEntriesDependency } from ".";
import { SenviParser } from "../../dependency";
import { TADIR } from "../../client";
import { Logger } from "../../logger";

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
    sapEntries[index].dependencies.push({
        dependencyIn,
        tableDependency: dependency
    });
    return sapEntries;
}

export const parseSenvi: Step<FindDependenciesWorkflowContext> = {
    name: 'parse-senvi',
    run: async (context: FindDependenciesWorkflowContext): Promise<void> => {
        const objectsSenvi = context.runtime.objectsSenvi;
        const aIgnoredDevclass = context.runtime.devclassIgnore;
        const senviParser = new SenviParser();
        context.runtime.parsedSenvi = [];
        context.output.sapEntries = [];
        Logger.loading(`Reading object dependencies...`);
        for (const objectSenvi of objectsSenvi) {
            Logger.log(`Parsing SENVI of TADIR object ${objectSenvi.tadir.pgmid} ${objectSenvi.tadir.object} ${objectSenvi.tadir.objName}, ${objectSenvi.senvi} entries`, true);
            for (const senvi of objectSenvi.senvi) {
                Logger.loading(`Parsing SENVI object ${senvi.type} ${senvi.object} ${senvi.enclObj}...`, true);
                const parsedSenvi = await senviParser.parse(senvi);
                Logger.log(`Result: ${JSON.stringify(parsedSenvi)}`, true);
                if (parsedSenvi && !aIgnoredDevclass.includes(parsedSenvi.devclass)) {
                    var aParsedSenvi: SapEntriesDependency[];
                    if (SAP_SOURCE_SYSTEMS.includes(parsedSenvi.srcsystem) || SAP_AUTHORS.includes(parsedSenvi.author)) {
                        aParsedSenvi = context.output.sapEntries;
                        Logger.log(`Dependency with SAP object`, true);
                    }else{
                        aParsedSenvi = context.runtime.parsedSenvi;
                        Logger.log(`Dependency with custom object`, true);
                    }
                    aParsedSenvi = _addEntry('TADIR', aParsedSenvi, objectSenvi.tadir, {
                        'PGMID': parsedSenvi.pgmid,
                        'OBJECT': parsedSenvi.object,
                        'OBJ_NAME': parsedSenvi.objName,
                        'DEVCLASS': parsedSenvi.devclass
                    });
                    if(parsedSenvi.subObject){
                        if(parsedSenvi.subObject.func){
                            aParsedSenvi = _addEntry('TFDIR', aParsedSenvi, objectSenvi.tadir, {
                                'FUNCNAME': parsedSenvi.subObject.func,
                                'PNAME': `SAPL${parsedSenvi.objName}`
                            });
                        }
                    }
                }
            }
        }
    }
}