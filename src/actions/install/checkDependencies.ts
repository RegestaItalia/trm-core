import { Step } from "@simonegaffurini/sammarksworkflow";
import { InstallWorkflowContext } from ".";
import { Logger } from "../../logger";
import { inspect } from "util";
import { CheckPackageDependencyActionInput, checkPackageDependencies } from "../checkPackageDependencies";

const SUBWORKFLOW_NAME = 'check-dependencies-sub-install';

export const checkDependencies: Step<InstallWorkflowContext> = {
    name: 'check-dependencies',
    filter: async (context: InstallWorkflowContext): Promise<boolean> => {
        if(!context.parsedInput.checkDependencies){
            Logger.log(`Skipping dependencies check (input)`, true);
            return false;
        }else{
            return true;
        }
    },
    run: async (context: InstallWorkflowContext): Promise<void> => {
        const trmManifest = context.runtime.trmManifest;
        const dependencies = trmManifest.dependencies || [];
        Logger.info(`Package has ${dependencies.length} dependencies.`);
        context.runtime.dependenciesToInstall = [];
        if(dependencies.length === 0){
            return;
        }
        const trmPackage = context.runtime.trmPackage;
        const systemPackages = context.parsedInput.systemPackages;
        const inputData: CheckPackageDependencyActionInput = {
            trmPackage,
            systemPackages,
            print: false
        };
        Logger.log(`Ready to execute sub-workflow ${SUBWORKFLOW_NAME}, input data: ${inspect(inputData, { breakLength: Infinity, compact: true })}`, true);
        Logger.loading(`Checking package dependencies...`);
        const result = await checkPackageDependencies(inputData);
        Logger.log(`Workflow ${SUBWORKFLOW_NAME} result: ${inspect(result, { breakLength: Infinity, compact: true })}`, true);
        const dependenciesOutput = result.dependencyStatus;
        var dependenciesToInstall = [];
        if(dependenciesOutput){
            dependenciesOutput.forEach(o => {
                if(!o.match){
                    dependenciesToInstall.push(o.dependency);
                }else{
                    if(!o.safe){
                        Logger.warning(`Dependency "${o.dependency.name}" is installed, but integrity doesn't match.`);
                    }
                }
            });
            if(dependenciesToInstall.length === 0){
                Logger.success(`Package dependencies ok.`);
            }else{
                Logger.info(`There's a total of ${dependenciesToInstall} dependencies needed in order to install "${trmManifest.name}".`);
            }
        }
        context.runtime.dependenciesToInstall = dependenciesToInstall;
    }
}