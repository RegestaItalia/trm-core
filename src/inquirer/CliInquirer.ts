import * as cliInquirer from "inquirer";
import { Question } from "./Question";
import { CliLogFileLogger, CliLogger, Logger } from "../logger";
import { IInquirer } from "./IInquirer";

export class CliInquirer implements IInquirer {

    constructor() { }

    public async prompt(arg1: Question | Question[]): Promise<any> {
        if(Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger){
            Logger.logger.forceStop();
        }
        return await cliInquirer.default.prompt(arg1);
    }
}