import * as cliInquirer from "inquirer";
import { CoreEnv } from "../commons";
import { Question } from "./Question";

export class Inquirer{
    coreEnv: CoreEnv;

    constructor(coreEnv: CoreEnv){
        this.coreEnv = coreEnv;
    }

    public async prompt(arg1: Question | Question[]): Promise<any> {
        if(this.coreEnv = CoreEnv.CLI){
            return await cliInquirer.default.prompt(arg1);
        }
    }
}