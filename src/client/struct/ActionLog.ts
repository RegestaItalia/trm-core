/** Role of a transport in a TRM action, as recorded in the SAP action log (/ATRM/LOG_TR_ROLE). */
export type ActionLogTransportRole = 'DEVC' | 'TADIR' | 'LANG' | 'CUST' | 'BKP' | 'DELE' | 'LAND' | 'DUMMY' | 'CG3Z';

/** What a TRM action did to a transport (/ATRM/LOG_EVENT). */
export type ActionLogTransportEvent = 'CREATE' | 'RELEASE' | 'FORWARD' | 'IMPORT' | 'DELETE' | 'DEQUEUE' | 'RESTORE';

/** Final status of a TRM action (/ATRM/LOG_STATUS): success, failed, rolled back. */
export type ActionLogStatus = 'S' | 'F' | 'B';

/** A TRM action starting (/ATRM/LOG_ACTION_START). SAP sets user and timestamp. */
export interface ActionLogStart {
    /** 32 characters. */
    actionId: string;
    /** TRM session ID, at most 36 characters. */
    sessionId: string;
    actionName: string;
    /** Action that started this one, e.g. the install of a package installing its dependency. */
    parentActionId?: string;
    packageName?: string;
    packageRegistry?: string;
    version?: string;
}

/** An event on a transport in a TRM action (/ATRM/LOG_EVT_IN). SAP sets user and timestamp. */
export interface ActionLogEvent {
    trkorr: string;
    event: ActionLogTransportEvent;
    /** First role recorded for the transport in the action wins. */
    role?: ActionLogTransportRole;
    /** TMS system, e.g. of an import. */
    target?: string;
    /** tp return code, e.g. of an import. */
    retcode?: number;
}
