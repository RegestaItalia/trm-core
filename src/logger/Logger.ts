import { CoreEnv } from "../commons";
import cliLogger from "loading-cli";
import * as cliTable from "cli-table3";
import { TraceLevel } from "./TraceLevel";
import { JSONLog } from "./JSONLog";
import { MessageType, ResponseMessage } from "trm-registry-types";

export class Logger{
    coreEnv: CoreEnv;
    traceLevel: TraceLevel;

    cliObj: any;
    loader: any;

    constructor(coreEnv: CoreEnv, traceLevel: TraceLevel){
        this.coreEnv = coreEnv;
        this.traceLevel = traceLevel;
        
        if(this.coreEnv === CoreEnv.CLI){
            this.cliObj = cliLogger({
                frames: ["⊶", "⊷"],
                interval: 1000
            });
        }
    }

    public loading(text: string){
        if(this.coreEnv === CoreEnv.CLI){
            this.forceStop();
            this.loader = this.cliObj.render().start(text);
        }
        if(this.coreEnv === CoreEnv.JSON){
            const log: JSONLog = {
                type: "loading",
                text
            };
            console.log(JSON.stringify(log));
        }
    }

    public success(text: string) {
        const aText = text.split('\n');
        aText.forEach(s => {
            if(this.coreEnv === CoreEnv.CLI){
                if(this.loader){
                    this.loader.succeed(s);
                    this.loader = null;
                }else{
                    this.cliObj.succeed(s);
                }
            }
            if(this.coreEnv === CoreEnv.JSON){
                const log: JSONLog = {
                    type: "success",
                    text: s
                };
                console.log(JSON.stringify(log));
            }
        });
    }

    public error(text: string) {
        const aText = text.split('\n');
        aText.forEach(s => {
            if(this.coreEnv === CoreEnv.CLI){
                if(this.loader){
                    this.loader.fail(s);
                    this.loader = null;
                }else{
                    this.cliObj.fail(s);
                }
            }
            if(this.coreEnv === CoreEnv.JSON){
                const log: JSONLog = {
                    type: "error",
                    text: s
                };
                console.log(JSON.stringify(log));
            }
        });
    }

    public warning(text: string) {
        const aText = text.split('\n');
        aText.forEach(s => {
            if(this.coreEnv === CoreEnv.CLI){
                if(this.loader){
                    this.loader.warn(s);
                    this.loader = null;
                }else{
                    this.cliObj.warn(s);
                }
            }
            if(this.coreEnv === CoreEnv.JSON){
                const log: JSONLog = {
                    type: "warning",
                    text: s
                };
                console.log(JSON.stringify(log));
            }
        });
    }

    public info(text: string) {
        const aText = text.split('\n');
        aText.forEach(s => {
            if(this.coreEnv === CoreEnv.CLI){
                if(this.loader){
                    this.loader.info(s);
                    this.loader = null;
                }else{
                    this.cliObj.info(s);
                }
            }
            if(this.coreEnv === CoreEnv.JSON){
                const log: JSONLog = {
                    type: "info",
                    text: s
                };
                console.log(JSON.stringify(log));
            }
        });
    }

    public log(text: string){
        const aText = text.split('\n');
        aText.forEach(s => {
            if(this.coreEnv === CoreEnv.CLI){
                if(this.loader){
                    this.cliObj.stop();
                }
                console.log(s);
            }
            if(this.coreEnv === CoreEnv.JSON){
                const log: JSONLog = {
                    type: "log",
                    text: s
                };
                console.log(JSON.stringify(log));
            }
        });
    }

    public table(header: any, data: any) {
        if(this.coreEnv === CoreEnv.CLI){
            var table = new cliTable.default({
                head: header,
                //colWidths: [300, 50]
            });
            data.forEach(arr => {
                table.push(arr);
            });
            console.log(table.toString());
        }
        if(this.coreEnv === CoreEnv.JSON){
            const log: JSONLog = {
                type: "error",
                text: JSON.stringify({header, data})
            };
            console.log(JSON.stringify(log));
        }
    }

    public registryResponse(response: ResponseMessage) {
        if(response.type === MessageType.ERROR){
            this.error(response.text);
        }
        if(response.type === MessageType.INFO){
            this.info(response.text);
        }
        if(response.type === MessageType.WARNING){
            this.warning(response.text);
        }
    }

    public forceStop() {
        try{
            this.cliObj.stop();
        }catch(e){ }
    }

    public static getDummy(): Logger {
        return new Logger(CoreEnv.DUMMY, TraceLevel.TRACE_ALL);
    }
}