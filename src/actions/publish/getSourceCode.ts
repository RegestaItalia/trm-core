import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "trm-commons";
import { SystemConnector } from "../../systemConnector";
import { DotAbapGit } from "../../abapgit";
import { minimatch } from "minimatch";

/**
 * Get source code (if abapgit developer is installed)
 * 
 * 1- get abapgit source code and object list
 * 
 * 2- get ignored objects
 * 
*/
export const getSourceCode: Step<PublishWorkflowContext> = {
    name: 'get-source-code',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Get source code step', true);

        try{
            Logger.loading(`Reading ${context.rawInput.packageData.devclass} source code...`);

            //1- get abapgit source code and object list
            const sourceCode = await SystemConnector.getAbapgitSource(context.rawInput.packageData.devclass);
            context.runtime.abapGitData.sourceCode.zip = sourceCode.zip;

            //2- get ignored objects
            context.runtime.abapGitData.dotAbapGit = await DotAbapGit.fromDevclass(context.rawInput.packageData.devclass);
            const ignoredPatterns = context.runtime.abapGitData.dotAbapGit.getIgnoredFiles();
            context.runtime.packageData.tadir = context.runtime.packageData.tadir.filter(o => o.object === 'SUSH');
            context.runtime.packageData.tadir.forEach(o => {
                const abapgitObject = sourceCode.objects.find(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName);
                if(abapgitObject){
                    ignoredPatterns.forEach(pattern => {
                        if(minimatch(abapgitObject.fullPath, pattern, { matchBase: true })){
                            if(!context.runtime.abapGitData.sourceCode.ignoredObjects.find(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName)){
                                context.runtime.abapGitData.sourceCode.ignoredObjects.push(o);
                            }
                        }
                    });
                }
            });
            if(ignoredPatterns.length > 0){
                Logger.info(`Excluding ${context.runtime.abapGitData.sourceCode.ignoredObjects.length} object(s) as configured in .abapgit.xml:\n${ignoredPatterns.join('\n ')}`);

            }
        }catch(e){
            Logger.error(e.toString(), true);
            Logger.info(`AbapGit Developer Version was not found, source code won't be exported.`);
        }
    }
}