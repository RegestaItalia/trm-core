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

    export function setPrefix(text: string): void {
        checkInquirer();
        return inquirer.setPrefix(text);
    }

    export function removePrefix(): void {
        checkInquirer();
        return inquirer.removePrefix();
    }

    export function getPrefix(): string {
        checkInquirer();
        return inquirer.getPrefix();
    }
}