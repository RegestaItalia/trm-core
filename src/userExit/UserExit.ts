import { IUserExit } from "./IUserExit";
import { listExitModules } from "./listExitModules";


export class UserExitManager {
    private static instance: UserExitManager;

    private constructor(private _modules: {
        module: string,
        instance: IUserExit
    }[]) { }

    public static async createInstance(): Promise<void> {
        const aExitModules = [];
        const exitModules = await listExitModules();
        for(const exitModule of exitModules){
            try{
                const exitImport = await import(exitModule);
                aExitModules.push({
                    module: exitModule,
                    instance: new exitImport.MyExit()
                });
            }catch(e){
                debugger
            }
        }
        UserExitManager.instance = new UserExitManager(aExitModules);
    }

    public static get(): IUserExit {
        return new Proxy({} as IUserExit, {
            get: (_, methodName: string | symbol) => {
                return (...args: any[]) => {
                    var exitResults = [];
                    for(const userExit of UserExitManager.instance._modules){
                        const method = (userExit.instance as any)[methodName];
                        if (typeof method === 'function') {
                            userExit.instance.prevUserExit = exitResults;
                            var result = method.apply(userExit.instance, args);
                            exitResults.push({
                                module: userExit.module,
                                result: result
                            });
                        }else{
                            //method not implemented in exit class
                        }
                    }
                    if(exitResults.length > 0){
                        return exitResults[exitResults.length -1].result;
                    }
                };
            }
        });
    }

}