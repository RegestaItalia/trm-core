import { TrmPackage } from "../../trmPackage";

/** Shared minimum context accepted by reusable action workflow steps. */
export interface IActionContext {
    /** Input supplied to the parent action. */
    rawInput: {
        /** Optional values shared by workflows that inspect the target SAP system. */
        contextData?: {
            /**
             * Packages already installed on the target system.
             *
             * Supplying this value avoids querying the connected system and is useful when
             * several actions share the same snapshot.
             */
            systemPackages?: TrmPackage[]
            /** Disable interactive prompts. Missing required choices then cause an error. */
            noInquirer?: boolean
        }
    };
}
