import { Question } from "./Question";

export interface IInquirer {
    prompt: (arg1: Question | Question[]) => Promise<any>,
    setPrefix: (text: string) => void,
    removePrefix: () => void,
    getPrefix: () => string
}