import { RegistryType } from "./RegistryType";
import normalizeUrl from "@esm2cjs/normalize-url";
import { AxiosHeaders, AxiosInstance, CreateAxiosDefaults } from "axios";
import { AuthOAuth2, AuthenticationType, OAuth2Data, Ping, Release, View, WhoAmI } from "trm-registry-types";
import { TrmArtifact } from "../trmPackage/TrmArtifact";
import * as FormData from "form-data";
import { Logger } from "../logger";
import { randomUUID } from "crypto";
import { Protocol } from "../protocol";
import opener from "opener";
import { OAuth2Body } from "trm-registry-types";
import _ from 'lodash';
import { Inquirer } from "../inquirer/Inquirer";
import { getAxiosInstance } from "../commons";
import { AbstractRegistry } from "./AbstractRegistry";

const AXIOS_CTX = "Registry";

export const PUBLIC_RESERVED_KEYWORD = 'public';

export class Registry implements AbstractRegistry {
    private _registryType: RegistryType;
    private _axiosInstance: AxiosInstance;
    private _authData: any;

    private _ping: Ping;
    private _whoami: WhoAmI;

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
            baseURL: this.endpoint
        }, AXIOS_CTX);
    }
    
    public compare(registry: AbstractRegistry): boolean {
        if(registry instanceof Registry){
            return this.endpoint === registry.endpoint;
        }else{
            return false;
        }
    }

    public getRegistryType(): RegistryType {
        return this._registryType;
    }

    public async authenticate(defaultData: any = {}): Promise<AbstractRegistry> {
        Logger.log(`Registry authentication request`, true);
        const ping = await this.ping();
        Logger.log(`Registry authentication type is: ${ping.authenticationType}`, true);
        if (ping.authenticationType !== AuthenticationType.NO_AUTH) {
            if (ping.authenticationType === AuthenticationType.BASIC) {
                await this._basicAuth(defaultData);
            }
            if (ping.authenticationType === AuthenticationType.OAUTH2) {
                await this._oauth2(defaultData);
            }
            if (ping.authenticationType === AuthenticationType.TOKEN) {
                await this._tokenAuth(defaultData);
            }
        }
        this._whoami = null;
        return this;
    }

    private async _basicAuth(defaultData: any = {}) {
        var axiosHeaders: AxiosHeaders = new AxiosHeaders();
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
        var axiosHeaders: AxiosHeaders = new AxiosHeaders();
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
        axiosHeaders.setAuthorization(`token ${token}`);
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
            const oAuth2: OAuth2Data = ping.authenticationData;
            const oAuth2ProtocolPath = "//oauth2";
            const sRedirectUri = `trm:${oAuth2ProtocolPath}`;
            const oAuth2Url = new URL(oAuth2.authorizationUrl);
            const oAuth2State = randomUUID();
            oAuth2Url.searchParams.append("client_id", oAuth2.clientId);
            oAuth2Url.searchParams.append("response_type", oAuth2.responseType);
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
        var axiosHeaders: AxiosHeaders = new AxiosHeaders();
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
        if (!this._ping) {
            try {
                this._ping = (await this._axiosInstance.get('/')).data;
            } catch (e) {
                throw new Error('Registry cannot be reached.')
            }
        }
        return this._ping;
    }

    public async whoAmI(): Promise<WhoAmI> {
        if (!this._whoami) {
            this._whoami = (await this._axiosInstance.get('/whoami')).data;
        }
        return this._whoami;
    }

    public async packageExists(name: string, version?: string): Promise<boolean> {
        var responseStatus: number;
        try {
            responseStatus = (await this._axiosInstance.get('/view', {
                params: {
                    name,
                    version
                }
            })).status;
        } catch (e) {
            responseStatus = 404;
        }
        return responseStatus === 200;
    }

    public async view(name: string, version: string = 'latest'): Promise<View> {
        const response = (await this._axiosInstance.get('/view', {
            params: {
                name,
                version
            }
        })).data;
        return response;
    }

    public async getArtifact(name: string, version: string = 'latest'): Promise<TrmArtifact> {
        const response = (await this._axiosInstance.get('/install', {
            params: {
                name,
                version
            },
            headers: {
                'Accept': 'application/octet-stream'
            },
            responseType: 'arraybuffer'
        })).data;
        return new TrmArtifact(response);
    }

    public async publishArtifact(packageName: string, version: string, artifact: TrmArtifact, readme?: string): Promise<void> {
        const fileName = `${packageName}@${version}`.replace('.', '_') + '.trm';
        const formData = new FormData.default();
        formData.append('artifact', artifact.binary, fileName);
        formData.append('readme', readme,);
        await this._axiosInstance.post('/publish', formData, {
            headers: formData.getHeaders()
        });
    }

    public async unpublish(packageName: string, version: string): Promise<void> {
        await this._axiosInstance.post('/unpublish', {
            package: packageName,
            version
        });
    }

    public async getReleases(packageName: string, versionRange: string): Promise<Release[]> {
        const response = (await this._axiosInstance.get('/releases', {
            params: {
                name: packageName,
                version: versionRange
            }
        })).data;
        return response;
    }

}