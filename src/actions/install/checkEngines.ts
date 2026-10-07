import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { checkEngines as CheckEnginesWkf, CheckEnginesActionInput, EngineCheckResult } from "../checkEngines";

function isAnyOf(result: EngineCheckResult): boolean {
    return result.path === 'anyOf' || result.path.endsWith('.anyOf');
}

function describeNotMet(result: EngineCheckResult): string {
    return `expected ${result.requirement}${result.reason ? ` (${result.reason})` : result.actual ? `, found ${result.actual}` : ''}`;
}

/** Lists the unmet requirements of a failed `anyOf`, skipping those under a satisfied nested `anyOf`. */
function getAnyOfDetails(results: EngineCheckResult[], anyOf: EngineCheckResult): EngineCheckResult[] {
    const satisfied = results.filter(o => isAnyOf(o) && o.ok).map(o => `${o.path}[`);
    return results.filter(o => !o.ok && o.path.startsWith(`${anyOf.path}[`) && !satisfied.some(prefix => o.path.startsWith(prefix)));
}

/**
 * Workflow step that blocks installation when the manifest engines are not satisfied.
 * 
 * 1- execute check engines workflow
 * 
 * 2- check result (detail each alternative of a failed anyOf)
 * 
*/
export const checkEngines: Step<InstallWorkflowContext> = {
    name: 'check-engines',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if (context.rawInput.installData.checks.noEngines) {
            Logger.log(`Skipping engines check (user input)`, true);
            return false;
        } else if (!context.runtime.package.data.manifest.engines) {
            Logger.log(`Package has no engines, skipping check`, true);
            return false;
        } else {
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        //1- execute check engines workflow
        const inputData: CheckEnginesActionInput = {
            contextData: {
                coreVersion: context.rawInput.contextData?.coreVersion
            },
            packageData: {
                manifest: context.runtime.package.data.manifest
            },
            printOptions: {
                enginesStatus: false,
                information: false
            }
        };
        Logger.loading(`Checking engines...`);
        const result = await CheckEnginesWkf(inputData);

        //2- check result
        const notMet = result.results.filter(o => o.required && !o.ok);
        if (!result.passed) {
            notMet.forEach(o => {
                Logger.error(`Engine requirement ${o.path} not met: ${describeNotMet(o)}`);
                if (isAnyOf(o)) {
                    getAnyOfDetails(result.results, o).forEach(detail => {
                        Logger.error(`  ${detail.path}: ${describeNotMet(detail)}`);
                    });
                }
            });
            if (notMet.length === 1) {
                throw new Error(`Install aborted. ${notMet.length} engine requirement is not met!`);
            } else {
                throw new Error(`Install aborted. ${notMet.length} engine requirements are not met!`);
            }
        } else {
            Logger.success(`Engines checked.`);
        }
    }
}
