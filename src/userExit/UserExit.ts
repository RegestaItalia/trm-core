import { Logger } from "../logger";
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
        for (const exitModule of exitModules) {
            try {
                const exitImport = await import(exitModule);
                aExitModules.push({
                    module: exitModule,
                    instance: new exitImport.MyExit()
                });
            } catch (e) {
                Logger.warning(`Exit module ${exitModule} couldn't be imported: ${e.toString()}`);
            }
        }
        UserExitManager.instance = new UserExitManager(aExitModules);
    }

    public static get(sync: boolean = false): IUserExit {
        return new Proxy({} as IUserExit, {
            get: (_, methodName: string | symbol) => {
                return (...args: any[]) => {
                    var exitResults = [];
                    const getResult = async () => {
                        for (const userExit of UserExitManager.instance._modules) {
                            const method = (userExit.instance as any)[methodName];
                            if (typeof method === 'function') {
                                userExit.instance.prevUserExit = exitResults;
                                var result = method.apply(userExit.instance, args);
                                if (result instanceof Promise) {
                                    exitResults.push({
                                        module: userExit.module,
                                        result: await result
                                    });
                                } else {
                                    exitResults.push({
                                        module: userExit.module,
                                        result: result
                                    });
                                }
                            } else {
                                //method not implemented in exit class
                            }
                        }
                        if (exitResults.length > 0) {
                            return exitResults[exitResults.length - 1].result;
                        }
                    }
                    if(!sync){
                        return getResult();
                    }else{
                        getResult();
                        if (exitResults.length > 0) {
                            return exitResults[exitResults.length - 1].result;
                        }
                    }
                };
            }
        });
    }

}