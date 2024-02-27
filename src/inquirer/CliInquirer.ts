import * as cliInquirer from "inquirer";
import { Question } from "./Question";

export class CliInquirer {

    constructor() { }

    public async prompt(arg1: Question | Question[]): Promise<any> {
        return await cliInquirer.default.prompt(arg1);
    }
}