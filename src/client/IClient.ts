import * as components from "./components";
import * as struct from "./struct";

export interface IClient {
    open: () => Promise<void>,
    checkConnection: () => Promise<boolean>
}