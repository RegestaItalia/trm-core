import { TrmPackage } from "../../trmPackage";

export interface IActionContext {
    rawInput: {
        contextData?: {
            systemPackages?: TrmPackage[]
            noInquirer?: boolean
        }
    };
}