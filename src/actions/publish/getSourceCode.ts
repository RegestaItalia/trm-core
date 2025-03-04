import { Step } from "@simonegaffurini/sammarksworkflow";
import { PublishWorkflowContext } from ".";
import { Logger } from "../../logger";
import { SystemConnector } from "../../systemConnector";
import { DotAbapGit } from "../../abapgit";

/**
 * Get source code (if abapgit developer is installed)
 * 
 * 1- read dot abapgit
 * 
 * 2- get abapgit source code and object list
 * 
 * 3- get ignored objects
 * 
*/
export const getSourceCode: Step<PublishWorkflowContext> = {
    name: 'get-source-code',
    run: async (context: PublishWorkflowContext): Promise<void> => {
        Logger.log('Get source code step', true);

        try{
            Logger.loading(`Reading ${context.rawInput.packageData.devclass} source code...`);

            //1- read dot abapgit
            context.runtime.abapGitData.dotAbapGit = await DotAbapGit.fromDevclass(context.rawInput.packageData.devclass);

            //2- get abapgit source code and object list
            const sourceCode = await SystemConnector.getAbapgitSource(context.rawInput.packageData.devclass);
            context.runtime.abapGitData.sourceCode.zip = sourceCode.zip;
            context.runtime.abapGitData.sourceCode.objects = sourceCode.objects;

            //3- get ignored objects
            context.runtime.packageData.tadir.forEach(o => {
                const object = context.runtime.abapGitData.sourceCode.objects.find(k => k.pgmid === o.pgmid && k.object === o.object && k.objName === o.objName);
                if(!object){
                    context.runtime.abapGitData.sourceCode.ignoredObjects.push(o);
                }
            });
        }catch(e){
            Logger.error(e.toString(), true);
            Logger.info(`AbapGit Developer Version was not found, source code won't be exported.`);
        }
    }
}