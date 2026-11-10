import { ActionLogEvent } from "./struct/ActionLog";

/** /ATRM/LOG_EVT_IN row of an action log event: same shape for RFC and REST. */
export function actionLogEventRow(event: ActionLogEvent) {
    return {
        trkorr: event.trkorr,
        role: event.role || '',
        event: event.event,
        target: event.target || '',
        retcode: event.retcode === undefined || event.retcode === null ? '' : String(event.retcode).padStart(4, '0')
    };
}
