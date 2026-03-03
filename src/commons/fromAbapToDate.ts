import { AS4DATE, AS4TIME } from "../client";
import { DateTime } from "luxon";
import { SystemConnector } from "../systemConnector";

function fromAbapToDateLegacy(as4date: AS4DATE, as4time: AS4TIME): Date {
    const aDate = Array.from(as4date);
    const aTime = Array.from(as4time);
    const year = parseInt(`${aDate[0]}${aDate[1]}${aDate[2]}${aDate[3]}`);
    const month = parseInt(`${aDate[4]}${aDate[5]}`) - 1;
    const day = parseInt(`${aDate[6]}${aDate[7]}`);
    const hour = parseInt(`${aTime[0]}${aTime[1]}`);
    const minutes = parseInt(`${aTime[2]}${aTime[3]}`);
    const seconds = parseInt(`${aTime[4]}${aTime[5]}`);
    return new Date(year, month, day, hour, minutes, seconds);
}

export async function fromAbapToDate(as4date: AS4DATE, as4time: AS4TIME): Promise<Date> {
    const ianaZone = await SystemConnector.getTimezone();

    const year = Number(as4date.slice(0, 4));
    const month = Number(as4date.slice(4, 6));
    const day = Number(as4date.slice(6, 8));

    const hour = Number(as4time.slice(0, 2));
    const minute = Number(as4time.slice(2, 4));
    const second = Number(as4time.slice(4, 6));

    const dt = DateTime.fromObject(
        { year, month, day, hour, minute, second },
        { zone: ianaZone }
    );

    if (!dt.isValid) {
        return fromAbapToDateLegacy(as4date, as4time);
    }

    return dt.toJSDate();
}