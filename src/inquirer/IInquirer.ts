import { Question } from "./Question";

export interface IInquirer {
    prompt: (arg1: Question | Question[]) => Promise<any>
}