import { IInquirer } from "./IInquirer";
import { Question } from "./Question";

export namespace Inquirer {
    export var inquirer: IInquirer;

    function checkInquirer(){
        if(!inquirer){
            throw new Error('Inquirer not initialized.');
        }
    }
    
    export function prompt(arg1: Question | Question[]): Promise<any> {
        checkInquirer();
        return inquirer.prompt(arg1);
    }
}