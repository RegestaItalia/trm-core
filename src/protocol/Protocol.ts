import ProtocolRegistry from "protocol-registry";
import { Express } from "express";
import express from "express";
import { Server } from "http";
import { AddressInfo } from "net";
import path from "path";
import { CallbackType } from "./CallbackType";

export class Protocol {
    private _app: Express;
    private _server: Server;

    constructor() {}

    public run(): Promise<CallbackType> {
        if(!this._app){
            this._app = express();
            this._app.use(express.json());
            this._server = this._app.listen(0, async () => {
                const nodePath = process.execPath;
                const address: AddressInfo = this._server.address() as AddressInfo;
                const url = `http://localhost:${address.port}`;
                /*await ProtocolRegistry.register({
                    protocol: "trm",
                    command: `"${nodePath}" "${path.join(__dirname, "./callback.js")}" ${url} $_URL_`,
                    override: true,
                    terminal: false,
                    script: false
                });*/
                await ProtocolRegistry.register(`trm`, `"${nodePath}" "${path.join(__dirname, "./callback.js")}" ${url} $_URL_`, {
                    override: true,
                    terminal: true
                });
            });
        }
        return new Promise((resolve, reject) => {
            this._app.post('/', (req, res, next) => {
                res.sendStatus(200);
                this._server.close();
                const data: CallbackType = req.body;
                resolve(data);
            });
        });
    }
}