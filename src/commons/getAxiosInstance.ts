import axios, { AxiosResponse, CreateAxiosDefaults } from "axios";
import { inspect } from "util";
import { CliLogFileLogger, Logger } from "trm-commons";
import { parse as htmlParser } from 'node-html-parser';
import { v4 as uuidv4 } from 'uuid';

export const AXIOS_SESSION_HEADER = 'X-TRM-SESSION-ID';
export const AXIOS_INTERNAL_HEADER = 'X-TRM-REQUEST-ID';

export type AxiosCtx = 'Registry' | 'RestServer';

function _getInternalId(response: AxiosResponse<any, any>){
    try{
        return response.request.getHeader(AXIOS_INTERNAL_HEADER)
    }catch(e){
        return 'Unknown';
    }
}

export function getAxiosInstance(config: CreateAxiosDefaults<any>, sCtx: AxiosCtx) {
    const instance = axios.create(config);
    instance.interceptors.request.use((request) => {
        const internalId = uuidv4();
        request.headers.set(AXIOS_INTERNAL_HEADER, internalId);
        if(Logger.logger instanceof CliLogFileLogger){
            request.headers.set(AXIOS_SESSION_HEADER, Logger.logger.getSessionId());
        }
        var sRequest = `${request.method} ${request.baseURL}${request.url}`;
        if (request.params) {
            sRequest += `, parameters: ${inspect(request.params, { breakLength: Infinity, compact: true })}`;
        }
        if (request.headers.getAuthorization()) {
            sRequest += `, authorization: HIDDEN`;
        }
        if (request.data) {
            sRequest += `, data: ${inspect(request.data, { breakLength: Infinity, compact: true })}`;
        }
        Logger.log(`${sCtx} AXIOS request ${internalId}: ${sRequest}`, true);
        return request;
    }, (error) => {
        Logger.error(`${sCtx} AXIOS request error: ${error}`, true);
        return Promise.reject(error);
    });
    instance.interceptors.response.use((response) => {
        const internalId = _getInternalId(response);
        var sResponse = `status: ${response.status}, status text: ${response.statusText}`;
        if (response.data) {
            sResponse += `, data: ${inspect(response.data, { breakLength: Infinity, compact: true })}`;
        }
        Logger.log(`Ending ${sCtx} AXIOS request ${internalId}: ${sResponse}`, true);
        return response;
    }, (error) => {
        if (error.response) {
            const internalId = _getInternalId(error.response);
            var sError;
            if (error.response.data) {
                if (error.config.responseType === 'arraybuffer') {
                    try {
                        const charset = /^application\/json;.*charset=([^;]*)/i.exec(error.response.headers['content-type'])[1];
                        const enc = new TextDecoder(charset);
                        error.response.data = JSON.parse(enc.decode(error.response.data));
                    } catch (e) { }
                }
                if (error.response.data.message && typeof (error.response.data.message) === 'string') {
                    sError = error.response.data.message;
                } else if(typeof(error.response.data) === 'string'){
                    if(error.response.data[0] === '<'){
                        try{
                            sError = htmlParser(error.response.data).querySelector('title').innerText;
                        }catch(e){
                            sError = error.response.data;
                        }
                    }else{
                        sError = error.response.data;
                    }
                } else{
                    sError = error.response.statusText;
                }
            } else {
                sError = error.response.statusText;
            }
            var oError: any = new Error(sError);
            oError.name = `Trm${sCtx}Error`;
            oError.status = error.response.status;
            oError.response = error.response.data || {};
            oError.axiosError = error;
            Logger.error(`${sCtx} response id ${internalId} error: ${error} (${JSON.stringify(sError)})`, true);
            return Promise.reject(oError);
        } else {
            Logger.error(`${sCtx} response error: ${error}`, true);
            return Promise.reject(error);
        }
    });
    return instance;
}