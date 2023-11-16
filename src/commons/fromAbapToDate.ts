import { AS4DATE, AS4TIME } from "../rfc/components";

export function fromAbapToDate(as4date: AS4DATE, as4time: AS4TIME): Date {
    const aDate = Array.from(as4date);
    const aTime = Array.from(as4time);
    const year = parseInt(`${aDate[0]}${aDate[1]}${aDate[2]}${aDate[3]}`);
    const month = parseInt(`${aDate[4]}${aDate[5]}`) -1;
    const day = parseInt(`${aDate[6]}${aDate[7]}`);
    const hour = parseInt(`${aTime[0]}${aTime[1]}`);
    const minutes = parseInt(`${aTime[2]}${aTime[3]}`);
    const seconds = parseInt(`${aTime[4]}${aTime[5]}`);
    return new Date(year, month, day, hour, minutes, seconds);
}