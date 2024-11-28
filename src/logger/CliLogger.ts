import cliLogger, { Loading } from "loading-cli";
import cliTable from "cli-table3";
import { MessageType, ResponseMessage } from "trm-registry-types";
import { ILogger } from "./ILogger";
import { TreeLog } from "./TreeLog";
import * as printTree from "print-tree";
import chalk from "chalk";

export class CliLogger implements ILogger {

    debug: boolean;

    private _cliObj: Loading;
    private _loader: Loading;
    private _prefix: string = '';

    constructor(debug: boolean) {
        this._cliObj = cliLogger({
            frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
            interval: 200
        });
    }

    public loading(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        this._loader = this._cliObj.render().start(this._prefix + text);
    }

    public success(text: string, debug?: boolean) {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            s = chalk.green(this._prefix + s);
            if (this._loader) {
                this._loader.succeed(s);
                this._clearLoader();
            } else {
                this._cliObj.succeed(s);
            }
        });
    }

    public error(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            s = chalk.red(this._prefix + s);
            if (this._loader) {
                this._loader.fail(s);
                this._clearLoader();
            } else {
                this._cliObj.fail(s);
            }
        });
    }

    public warning(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            s = chalk.yellow(this._prefix + s);
            if (this._loader) {
                this._loader.warn(s);
                this._clearLoader();
            } else {
                this._cliObj.warn(s);
            }
        });
    }

    public info(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            s = this._prefix + s;
            if (this._loader) {
                this._loader.info(s);
                this._clearLoader();
            } else {
                this._cliObj.info(s);
            }
        });
    }

    public log(text: string, debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        const aText = text.split('\n');
        aText.forEach(s => {
            s = chalk.dim(this._prefix + s);
            if (this._loader) {
                this.forceStop();
            }
            console.log(s);
        });
    }

    public table(header: string[], data: string[][], debug?: boolean): void {
        if (debug && !this.debug) {
            return;
        }
        var table = new cliTable({
            head: header,
            chars: { 'top': '═' , 'top-mid': '╤' , 'top-left': '╔' , 'top-right': '╗'
                , 'bottom': '═' , 'bottom-mid': '╧' , 'bottom-left': '╚' , 'bottom-right': '╝'
                , 'left': '║' , 'left-mid': '╟' , 'mid': '─' , 'mid-mid': '┼'
                , 'right': '║' , 'right-mid': '╢' , 'middle': '│' }
            //colWidths: [300, 50]
        });
        data.forEach(arr => {
            table.push(arr);
        });
        console.log(this._prefix + table.toString());
    }

    public registryResponse(response: ResponseMessage, debug?: boolean): void {
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

    public tree(data: TreeLog, debug?: boolean): void {
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
        this.forceStop();
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

    public forceStop(): void {
        try {
            this._loader.stop();
            this._clearLoader();
        } catch (e) { }
    }

    private _clearLoader(): void {
        delete this._loader;
    }

    public setPrefix(text: string): void {
        this._prefix = text;
    }

    public removePrefix(): void {
        this._prefix = '';
    }

    public getPrefix(): string {
        return this._prefix;
    }

}