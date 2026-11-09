import type { SYSYSID } from "./components";

/** Standard system info of the connected system (`RFC_SYSTEM_INFO`): no TRM authorization needed. */
export interface SystemRuntimeInfo {
    /** System ID. */
    dest: SYSYSID,
    /** Database system, e.g. `HDB`. */
    dbSystem?: string,
    /** Kernel release, e.g. `793`. */
    kernelRelease?: string
}
