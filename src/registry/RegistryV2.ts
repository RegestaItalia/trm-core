import { RegistryType } from "./RegistryType";
import normalizeUrl from "@esm2cjs/normalize-url";
import { AxiosError, AxiosHeaders, AxiosInstance, CreateAxiosDefaults } from "axios";
import { AuthOAuth2, AuthenticationType, Deprecate, DistTagAdd, DistTagRm, OAuth2Data, Package, Ping, WhoAmI } from "trm-registry-types";
import { TrmArtifact } from "../trmPackage/TrmArtifact";
import * as FormData from "form-data";
import { Logger, Inquirer } from "trm-commons";
import { randomUUID } from "crypto";
import { Protocol } from "../protocol";
import opener from "opener";
import { OAuth2Body } from "trm-registry-types";
import _ from 'lodash';
import { getAxiosInstance, getNodePackage } from "../commons";
import { AbstractRegistry } from "./AbstractRegistry";
import NodeCache from "node-cache";

const AXIOS_CTX = "RegistryV2";

export const PUBLIC_RESERVED_KEYWORD = 'public';

export class RegistryV2 implements AbstractRegistry {
    private _cache: NodeCache = new NodeCache({ stdTTL: 60, useClones: false });
    private _registryType: RegistryType;
    private _axiosInstance: AxiosInstance;
    private _authData: any;
    private _userAgent: string;

    constructor(public endpoint: string, public name: string = 'Unknown') {
        var envEndpoint = process.env.TRM_PUBLIC_REGISTRY_ENDPOINT;
        Logger.log(`TRM_PUBLIC_REGISTRY_ENDPOINT Environment variable: ${envEndpoint}`, true);
        if (!envEndpoint || envEndpoint.trim().toLowerCase() === PUBLIC_RESERVED_KEYWORD) {
            //no env var value or env var value = public
            envEndpoint = 'https://www.trmregistry.com/registry';
        }
        if (endpoint.trim().toLowerCase() === PUBLIC_RESERVED_KEYWORD) {
            //if input endpoint is public
            this._registryType = RegistryType.PUBLIC;
        } else {
            //all other cases
            this._registryType = RegistryType.PRIVATE;
        }
        if (this._registryType === RegistryType.PUBLIC) {
            this.endpoint = envEndpoint;
            this.name = PUBLIC_RESERVED_KEYWORD;
        } else {
            this.endpoint = endpoint;
        }
        Logger.log(`Endpoint type: ${this._registryType}`, true);
        Logger.log(`Endpoint before normalize: ${this.endpoint}`, true);
        this.endpoint = normalizeUrl(this.endpoint, {
            stripHash: true,
            removeQueryParameters: true
        });
        Logger.log(`Endpoint after normalize: ${this.endpoint}`, true);
        if (this.endpoint.length > 100) {
            throw new Error(`Registry address length is too long! Maximum allowed is 100.`);
        }
        this._axiosInstance = getAxiosInstance({
            baseURL: this.endpoint,
            headers: this.getDefaultAxiosHeaders()
        }, AXIOS_CTX);
    }

    private getDefaultAxiosHeaders(): AxiosHeaders {
        var axiosHeaders: AxiosHeaders = new AxiosHeaders();
        if (!this._userAgent) {
            try {
                this._userAgent = `trm-core v${getNodePackage().version}`;
            } catch { }
        }
        axiosHeaders.setUserAgent(this._userAgent || `trm-core`);
        return axiosHeaders;
    }

    public compare(registry: AbstractRegistry): boolean {
        if (registry instanceof RegistryV2) {
            return this.endpoint === registry.endpoint;
        } else {
            return false;
        }
    }

    public getRegistryType(): RegistryType {
        return this._registryType;
    }

    public async authenticate(defaultData: any = {}): Promise<AbstractRegistry> {
        Logger.log(`Registry authentication request`, true);
        const ping = await this.ping();
        Logger.log(`Registry authentication type is: ${ping.authentication_type}`, true);
        if (ping.authentication_type !== AuthenticationType.NO_AUTH) {
            if (ping.authentication_type === AuthenticationType.BASIC) {
                await this._basicAuth(defaultData);
            }
            if (ping.authentication_type === AuthenticationType.OAUTH2) {
                await this._oauth2(defaultData);
            }
            if (ping.authentication_type === AuthenticationType.TOKEN) {
                await this._tokenAuth(defaultData);
            }
        }
        this._cache.flushAll();
        return this;
    }

    private async _basicAuth(defaultData: any = {}) {
        var axiosHeaders: AxiosHeaders = this.getDefaultAxiosHeaders();
        var axiosDefaults: CreateAxiosDefaults = {
            baseURL: this.endpoint,
            headers: axiosHeaders
        };
        var username = defaultData.username;
        var password = defaultData.password;
        const inq1 = await Inquirer.prompt([{
            type: "input",
            name: "username",
            message: "Registry username",
            validate: (input) => {
                return input ? true : false;
            },
            when: !username
        }, {
            type: "password",
            name: "password",
            message: "Registry password",
            validate: (input) => {
                return input ? true : false;
            },
            when: !password
        }]);
        username = username || inq1.username;
        password = password || inq1.password;
        const basicAuth = `${username}:${password}`;
        const encodedBasicAuth = Buffer.from(basicAuth).toString('base64');
        axiosHeaders.setAuthorization(`Basic ${encodedBasicAuth}`);
        this._axiosInstance = getAxiosInstance(axiosDefaults, AXIOS_CTX);
        this._authData = {
            username,
            password
        };
    }

    private async _tokenAuth(defaultData: any = {}) {
        var axiosHeaders: AxiosHeaders = this.getDefaultAxiosHeaders();
        var axiosDefaults: CreateAxiosDefaults = {
            baseURL: this.endpoint,
            headers: axiosHeaders
        };
        var token = defaultData.token;
        if (!token && this._registryType == RegistryType.PUBLIC) {
            Logger.info(`To authenticate, generate a new token.`);
            Logger.info(`Follow the instructions https://docs.trmregistry.com/#/registry/public/authentication.`);
        }
        const inq1 = await Inquirer.prompt([{
            type: "input",
            name: "token",
            message: "Registry token",
            validate: (input) => {
                return input ? true : false;
            },
            when: !token
        }]);
        token = token || inq1.token;
        axiosHeaders.setAuthorization(`Bearer ${token}`);
        this._axiosInstance = getAxiosInstance(axiosDefaults, AXIOS_CTX);
        this._authData = {
            token
        };
    }

    private async _oauth2(defaultData: any = {}) {
        const ping = await this.ping();
        var runAuthFlow = false;
        const accessToken = defaultData.access_token;
        const refreshToken = defaultData.refresh_token;
        const tokenExpiry = defaultData.expires_in;
        const accessTokenTimestamp = defaultData.access_token_timestamp;
        const currentDate = new Date();
        var authData: any;
        var oAuth2Request: OAuth2Body;
        var oAuth2Response: AuthOAuth2;
        if (accessToken && accessTokenTimestamp && tokenExpiry) {
            try {
                const tokenDate = new Date(accessTokenTimestamp);
                const elapsedSeconds = (currentDate.getTime() - tokenDate.getTime()) / 1000;
                if (elapsedSeconds >= parseInt(tokenExpiry)) {
                    if (refreshToken) {
                        oAuth2Request = {
                            grant_type: "refresh_token",
                            refresh_token: refreshToken
                        };
                        oAuth2Response = (await (getAxiosInstance({
                            baseURL: this.endpoint
                        }, AXIOS_CTX)).post('/auth', oAuth2Request)).data;
                        runAuthFlow = false;
                        authData = {
                            access_token: oAuth2Response.access_token,
                            expires_in: oAuth2Response.expires_in,
                            refresh_token: refreshToken,
                            access_token_timestamp: currentDate.getTime()
                        };
                    } else {
                        runAuthFlow = true;
                    }
                } else {
                    runAuthFlow = false;
                    authData = {
                        access_token: accessToken,
                        expires_in: tokenExpiry,
                        refresh_token: refreshToken,
                        access_token_timestamp: accessTokenTimestamp
                    };
                }
            } catch (e) {
                runAuthFlow = true;
            }
        } else {
            runAuthFlow = true;
        }
        if (runAuthFlow) {
            const oAuth2: OAuth2Data = ping.authentication_data;
            const oAuth2ProtocolPath = "//oauth2";
            const sRedirectUri = `trm:${oAuth2ProtocolPath}`;
            const oAuth2Url = new URL(oAuth2.authorization_url);
            const oAuth2State = randomUUID();
            oAuth2Url.searchParams.append("client_id", oAuth2.client_id);
            oAuth2Url.searchParams.append("response_type", oAuth2.response_type);
            oAuth2Url.searchParams.append("redirect_uri", sRedirectUri);
            oAuth2Url.searchParams.append("state", oAuth2State);
            var sAuth2Url = oAuth2Url.toString();
            if (oAuth2.scope) {
                sAuth2Url = `${sAuth2Url}&scope=${oAuth2.scope}`;
            }
            Logger.info(`Open login url at ${sAuth2Url}`);
            opener(sAuth2Url);
            const oAuth2Callback = await new Protocol().run();
            if (oAuth2Callback.path.startsWith(sRedirectUri)) {
                if (oAuth2Callback.parameters.state != oAuth2State) {
                    throw new Error("Different state received in callback.")
                }
                oAuth2Request = {
                    code: oAuth2Callback.parameters.code,
                    grant_type: "authorization_code",
                    redirect_uri: sRedirectUri
                };
                oAuth2Response = (await (getAxiosInstance({
                    baseURL: this.endpoint
                }, AXIOS_CTX)).post('/auth', oAuth2Request)).data;
                if (oAuth2Response.token_type !== "Bearer") {
                    throw new Error('Unknown token type.');
                }
                authData = {
                    access_token: oAuth2Response.access_token,
                    expires_in: oAuth2Response.expires_in,
                    refresh_token: oAuth2Response.refresh_token,
                    access_token_timestamp: currentDate.getTime()
                };
            } else {
                throw new Error("Callback received on a different uri.");
            }
        }
        this._authData = authData;
        var axiosHeaders: AxiosHeaders = this.getDefaultAxiosHeaders();
        var axiosDefaults: CreateAxiosDefaults = {
            baseURL: this.endpoint,
            headers: axiosHeaders
        };
        axiosHeaders.setAuthorization(`Bearer ${this._authData.access_token}`);
        this._axiosInstance = getAxiosInstance(axiosDefaults, AXIOS_CTX);
    }

    public getAuthData(): any {
        return this._authData;
    }

    public async ping(): Promise<Ping> {
        var data: Ping | Error = this._cache.get('ping');
        if (!data) {
            try {
                data = (await this._axiosInstance.get('/', {
                    headers: {}
                })).data;
            } catch (e) {
                if (e.errors) {
                    e.errors.forEach(err => Logger.error(err.message));
                }
                data = new Error(`Registry "${this.name}" cannot be reached.`)
            }
            this._cache.set('ping', data);
        }
        if (data instanceof Error) {
            throw data;
        } else {
            return data;
        }
    }

    public async whoAmI(): Promise<WhoAmI> {
        var data: WhoAmI | Error = this._cache.get('whoami');
        if (!data) {
            try {
                data = (await this._axiosInstance.get('/whoami')).data;
            } catch (e) {
                data = e;
            }
            this._cache.set('whoami', data);
        }
        if (data instanceof Error) {
            throw data;
        } else {
            return data;
        }
    }

    public async getPackage(fullName: string, version: string = 'latest'): Promise<Package> {
        var data: Package | Error = this._cache.get(`package-${fullName}-${version}`);
        if (!data) {
            var ttl: number;
            try {
                data = (await this._axiosInstance.get(`/package/${encodeURIComponent(fullName)}`, {
                    params: {
                        version: encodeURIComponent(version)
                    }
                })).data;
                if ((data as Package).download_link_expiry) {
                    try {
                        ttl = Math.max(0, Math.floor(((data as Package).download_link_expiry - Date.now()) / 1000));
                    } catch { }
                }
            } catch (e) {
                data = e;
            }
            this._cache.set(`package-${fullName}-${version}`, data, ttl);
        }
        if (data instanceof Error) {
            throw data;
        } else {
            return data;
        }
    }

    public async downloadArtifact(fullName: string, version: string = 'latest'): Promise<TrmArtifact> {
        var buffer: Buffer;
        const packageData = await this.getPackage(fullName, version);
        try {
            buffer = (await this._axiosInstance.get(packageData.download_link, {
                headers: {
                    'Accept': 'application/octet-stream',
                },
                maxRedirects: 10,
                responseType: 'arraybuffer',
                validateStatus: s => s >= 200 && s < 400,
            })).data;
        } catch (e) {
            Logger.error(e.toString(), true);
            Logger.error(`Failed to fetch package at ${packageData.download_link}: ${(e as AxiosError).message}`);
            throw e;
        }
        return new TrmArtifact(buffer);
    }

    public async validatePublish(fullName: string, version: string = 'latest', isPrivate: boolean): Promise<void> {
        const status = (await this._axiosInstance.get(`/publish/check/${encodeURIComponent(fullName)}`, {
            params: {
                version: encodeURIComponent(version),
                private: isPrivate ? 'X' : 'N'
            }
        })).status;
        if (status !== 204) {
            throw new Error(`Package cannot be published`);
        }
    }

    public async publish(fullName: string, version: string, artifact: TrmArtifact, readme?: string, tags?: string): Promise<Package> {
        const fileName = `${fullName}_v${version}`.replace('.', '_') + '.trm';
        const formData = new FormData.default();
        formData.append('artifact', artifact.binary, {
            filename: fileName,
            contentType: 'application/octet-stream'
        });
        if (readme) {
            formData.append('readme', Buffer.from(readme), {
                filename: 'readme.md',
                contentType: 'text/markdown'
            });
        }
        var params = { version, tags };
        if(!tags){
            delete params.tags;
        }
        return (await this._axiosInstance.post(`/publish/${encodeURIComponent(fullName)}`, formData, {
            params,
            headers: formData.getHeaders()
        })).data;
    }

    public async unpublish(fullName: string, version: string): Promise<void> {
        await this._axiosInstance.post(`/unpublish/${encodeURIComponent(fullName)}`, null, {
            params: {
                version: encodeURIComponent(version)
            }
        });
    }

    public async deprecate(fullName: string, version: string, deprecate: Deprecate): Promise<void> {
        await this._axiosInstance.post(`/deprecate/${encodeURIComponent(fullName)}`, {
            deprecate_note: deprecate.deprecate_note
        }, {
            params: {
                version: encodeURIComponent(version)
            }
        });
    }

    public async addDistTag(fullName: string, distTag: DistTagAdd): Promise<void> {
        const status = (await this._axiosInstance.put(`/package/tag/${encodeURIComponent(fullName)}`, distTag)).status;
        if (status !== 204) {
            throw new Error(`Cannot add tag "${distTag.tag.trim().toUpperCase()}"`);
        }
    }

    public async rmDistTag(fullName: string, distTag: DistTagRm): Promise<void> {
        const status = (await this._axiosInstance.delete(`/package/tag/${encodeURIComponent(fullName)}`, {
            data: distTag
        })).status;
        if (status !== 204) {
            throw new Error(`Cannot remove tag "${distTag.tag.trim().toLowerCase()}"`);
        }
    }

}