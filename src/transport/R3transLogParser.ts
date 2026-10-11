import * as fs from "fs";
import * as readline from "readline";

export type ReleaseLogStep = {
    id: string,
    name: string,
    endDateTime?: number,
    exitCode?: number,
    log?: string
}

// Note: no "g" flag, these are only ever tested/executed once per line (a shared "g" regex
// would carry lastIndex state across lines and silently start missing matches).
const STEP_BLOCK_START_REGEX = /^\d\s*ETP199X/i;
const STEP_BLOCK_END_REGEX = /^\d\s*ETP199/i;
const STEP_HEADER_REGEX = /^\d\s*(ETP\d{3})\s*(.*)/i;
const STEP_LOG_LINE_REGEX = /^\d\s*\w{3}\d{3}\s(.*)/i;
const STEP_END_DATETIME_REGEX = /^\d\sETP110\s*.*:\s*"(\d*)"/i;
const STEP_EXIT_CODE_REGEX = /^\d\sETP111\s*.*:\s*"(\d*)"/i;

export class R3transLogParser {

    constructor(private _log: string) { }

    private _getStream(): fs.ReadStream {
        return fs.createReadStream(this._log);
    }

    private _parseStepHeader(line: string): ReleaseLogStep | null {
        const match = STEP_HEADER_REGEX.exec(line);
        if (!match) {
            return null;
        }
        return {
            id: match[1],
            name: match[2],
            endDateTime: null,
            exitCode: null,
            log: null
        };
    }

    private _appendStepDetails(step: ReleaseLogStep, line: string): void {
        const logMatch = STEP_LOG_LINE_REGEX.exec(line);
        if (logMatch) {
            step.log = step.log ? `${step.log}\n${logMatch[1]}` : logMatch[1];
        }
        const endDateTimeMatch = STEP_END_DATETIME_REGEX.exec(line);
        if (endDateTimeMatch) {
            step.endDateTime = parseInt(endDateTimeMatch[1]);
        }
        const exitCodeMatch = STEP_EXIT_CODE_REGEX.exec(line);
        if (exitCodeMatch) {
            step.exitCode = parseInt(exitCodeMatch[1]);
        }
    }

    public async getReleaseLog(): Promise<ReleaseLogStep[]> {
        return await new Promise<ReleaseLogStep[]>((res) => {
            const steps: ReleaseLogStep[] = [];
            var atStepBoundary = false;
            var currentStep: ReleaseLogStep;
            const rl = readline.createInterface({
                input: this._getStream(),
                crlfDelay: Infinity
            });
            rl.on('line', (line) => {
                if (atStepBoundary) {
                    currentStep = this._parseStepHeader(line) || currentStep;
                }
                if (STEP_BLOCK_START_REGEX.test(line)) {
                    atStepBoundary = true;
                } else {
                    atStepBoundary = false;
                    if (STEP_BLOCK_END_REGEX.test(line)) {
                        if (currentStep) {
                            steps.push(currentStep);
                        }
                    } else if (currentStep) {
                        this._appendStepDetails(currentStep, line);
                    }
                }
            });

            rl.on('close', () => {
                res(steps);
            });
        });
    }

    public static parseExitCode(exitCode?: number): {
        type: 'SUCCESS' | 'ERROR' | 'WARNING' | 'UNKNOWN',
        value: string
    } {
        if (exitCode === undefined || exitCode === null) {
            return {
                type: 'UNKNOWN',
                value: 'Unknown exit code.'
            };
        }
        switch (exitCode) {
            case 0:
                return { type: 'SUCCESS', value: 'No errors or problems have occurred.' };
            case 4:
                return { type: 'WARNING', value: 'Warnings have occurred but they can be ignored.' };
            case 8:
                return { type: 'ERROR', value: 'Transport could not be completed. Problems occurred with certain objects.' };
            case 12:
                return { type: 'ERROR', value: 'Fatal errors have occurred, such as errors while reading or writing a file or unexpected errors within the database interface, in particular database problems.' };
            case 16:
                return { type: 'ERROR', value: 'Situations have occurred that are normally not allowed.' };
            default:
                return { type: 'ERROR', value: 'Return code not set by R3trans itself but point to errors, such as segmentation faults.' };
        }
    }

}
