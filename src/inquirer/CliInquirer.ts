import * as cliInquirer from "inquirer";
import { Question } from "./Question";
import { CliLogFileLogger, CliLogger, Logger } from "../logger";

export class CliInquirer {

    constructor() { }

    public async prompt(arg1: Question | Question[]): Promise<any> {
        if(Logger.logger instanceof CliLogger || Logger.logger instanceof CliLogFileLogger){
            Logger.logger.forceStop();
        }
        return await cliInquirer.default.prompt(arg1);
    }
}