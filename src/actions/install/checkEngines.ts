import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { checkEngines as CheckEnginesWkf, CheckEnginesActionInput, EngineCheckResult } from "../checkEngines";

function requirementsError(missingSapEntries: number, notMetEngines: number): Error {
    const parts = [
        missingSapEntries > 0 ? `${missingSapEntries} system ${missingSapEntries === 1 ? 'requirement' : 'requirements'}` : '',
        notMetEngines > 0 ? `${notMetEngines} engine ${notMetEngines === 1 ? 'requirement' : 'requirements'}` : ''
    ].filter(Boolean);
    const total = missingSapEntries + notMetEngines;
    return new Error(`Install aborted. ${parts.join(' and ')} ${total === 1 ? 'is' : 'are'} not met!`);
}

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
        if (context.runtime.missingSapEntries > 0) {
            // Aborts the install for the missing SAP entries.
            return true;
        } else if (context.rawInput.installData.checks.noEngines) {
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
        const missingSapEntries = context.runtime.missingSapEntries || 0;
        if (context.rawInput.installData.checks.noEngines || !context.runtime.package.data.manifest.engines) {
            throw requirementsError(missingSapEntries, 0);
        }
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
                Logger.error(`Engine requirement ${o.path} not met: ${describeNotMet(o)}`, { important: true });
                if (isAnyOf(o)) {
                    getAnyOfDetails(result.results, o).forEach(detail => {
                        Logger.error(`  ${detail.path}: ${describeNotMet(detail)}`, { important: true });
                    });
                }
            });
            throw requirementsError(missingSapEntries, notMet.length);
        }
        Logger.success(`Engines checked.`);
        if (missingSapEntries > 0) {
            throw requirementsError(missingSapEntries, 0);
        }
    }
}
