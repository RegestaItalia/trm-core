import cliLogger, { Loading } from "loading-cli";
import cliTable from "cli-table3";
import { MessageType, ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";
import { TreeLog } from "./TreeLog";
import * as printTree from "print-tree";

export class CliLogger implements ILogger {

    private _cliObj: Loading;
    private _loader: Loading;
    debug: boolean;

    constructor(debug: boolean) {
        this._cliObj = cliLogger({
            frames: ["⊶", "⊷"],
            interval: 1000
        });
    }

    public loading(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        this._loader = this._cliObj.render().start(text);
    }

    public success(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            if (this._loader) {
                this._loader.succeed(s);
                this._clearLoader();
            } else {
                this._cliObj.succeed(s);
            }
        });
    }

    public error(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            if (this._loader) {
                this._loader.fail(s);
                this._clearLoader();
            } else {
                this._cliObj.fail(s);
            }
        });
    }

    public warning(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            if (this._loader) {
                this._loader.warn(s);
                this._clearLoader();
            } else {
                this._cliObj.warn(s);
            }
        });
    }

    public info(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            if (this._loader) {
                this._loader.info(s);
                this._clearLoader();
            } else {
                this._cliObj.info(s);
            }
        });
    }

    public log(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            if (this._loader) {
                this.forceStop();
            }
            console.log(s);
        });
    }

    public table(header: any, data: any, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        var table = new cliTable({
            head: header,
            //colWidths: [300, 50]
        });
        data.forEach(arr => {
            table.push(arr);
        });
        console.log(table.toString());
    }

    public registryResponse(response: ResponseMessage, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        if (response.type === MessageType.ERROR) {
            this.error(response.text, debug);
        }
        if (response.type === MessageType.INFO) {
            this.info(response.text, debug);
        }
        if (response.type === MessageType.WARNING) {
            this.warning(response.text, debug);
        }
    }

    public tree(data: TreeLog, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const _parseBranch = (o: TreeLog) => {
            var children = [];
            o.children.forEach(k => {
                children.push(_parseBranch(k));
            });
            return {
                name: o.text,
                children
            };
        }
        const treeData = _parseBranch(data);
        printTree.default(
            treeData,
            (node) => {
                return node.name;
            },
            (node) => { 
                return node.children;
            }
        );
    }

    public forceStop() {
        try {
            this._loader.stop();
            this._clearLoader();
        } catch (e) { }
    }

    private _clearLoader() {
        delete this._loader;
    }

}