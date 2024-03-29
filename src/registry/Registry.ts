import { RegistryType } from "./RegistryType";
import normalizeUrl from "@esm2cjs/normalize-url";
import axios, { AxiosHeaders, AxiosInstance, CreateAxiosDefaults } from "axios";
import { AuthOAuth2, AuthenticationType, OAuth2Data, Ping, Release, View, WhoAmI } from "trm-registry-types";
import { TrmArtifact } from "../trmPackage/TrmArtifact";
import * as FormData from "form-data";
import { Inquirer } from "../inquirer";
import { Logger } from "../logger";
import { randomUUID } from "crypto";
import { Protocol } from "../protocol";
import opener from "opener";
import { OAuth2Body } from "trm-registry-types";

export class Registry {
    private _registryType: RegistryType;
    private _axiosInstance: AxiosInstance;
    private _authData: any;

    private _ping: Ping;
    private _whoami: WhoAmI;

    constructor(public endpoint: string, public name: string = 'Unknown') {
        if (endpoint.trim().toLowerCase() === 'public') {
            this.endpoint = process.env.TRM_PUBLIC_REGISTRY_ENDPOINT || 'https://www.trmregistry.com/registry';
            this._registryType = RegistryType.PUBLIC;
        } else {
            this.endpoint = endpoint;
            this._registryType = RegistryType.PRIVATE;
        }
        this.endpoint = normalizeUrl(this.endpoint, {
            stripHash: true,
            removeQueryParameters: true
        });
        if (this.endpoint.length > 100) {
            throw new Error(`Registry address length is too long! Maximum allowed is 100.`);
        }
        this._axiosInstance = axios.create({
            baseURL: this.endpoint
        });
    }

    public getRegistryType(): RegistryType {
        return this._registryType;
    }

    public async authenticate(inquirer: Inquirer, logger: Logger, defaultData: any = {}): Promise<Registry> {
        const ping = await this.ping();
        if (ping.authenticationType !== AuthenticationType.NO_AUTH) {
            if (ping.authenticationType === AuthenticationType.BASIC) {
                await this._basicAuth(inquirer, logger, defaultData);
            }
            if (ping.authenticationType === AuthenticationType.OAUTH2) {
                await this._oauth2(inquirer, logger, defaultData);
            }
            if (ping.authenticationType === AuthenticationType.TOKEN) {
                await this._tokenAuth(inquirer, logger, defaultData);
            }
        }
        this._whoami = null;
        return this;
    }

    private async _basicAuth(inquirer: Inquirer, logger: Logger, defaultData: any = {}) {
        var axiosHeaders: AxiosHeaders = new AxiosHeaders();
        var axiosDefaults: CreateAxiosDefaults = {
            baseURL: this.endpoint,
            headers: axiosHeaders
        };
        var username = defaultData.username;
        var password = defaultData.password;
        const inq1 = await inquirer.prompt([{
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
        this._axiosInstance = axios.create(axiosDefaults);
        this._authData = {
            username,
            password
        };
    }

    private async _tokenAuth(inquirer: Inquirer, logger: Logger, defaultData: any = {}) {
        var axiosHeaders: AxiosHeaders = new AxiosHeaders();
        var axiosDefaults: CreateAxiosDefaults = {
            baseURL: this.endpoint,
            headers: axiosHeaders
        };
        var token = defaultData.token;
        if (!token && this._registryType == RegistryType.PUBLIC) {
            logger.info(`To authenticate, generate a new token.`);
            logger.info(`Follow the instructions https://docs.trmregistry.com/#/registry/public/authentication.`);
        }
        const inq1 = await inquirer.prompt([{
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
        this._axiosInstance = axios.create(axiosDefaults);
        this._authData = {
            token
        };
    }

    private async _oauth2(inquirer: Inquirer, logger: Logger, defaultData: any = {}) {
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
                        oAuth2Response = (await (axios.create({
                            baseURL: this.endpoint
                        })).post('/auth', oAuth2Request)).data;
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
            logger.info(`Open login url at ${sAuth2Url}`);
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
                oAuth2Response = (await (axios.create({
                    baseURL: this.endpoint
                })).post('/auth', oAuth2Request)).data;
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
        this._axiosInstance = axios.create(axiosDefaults);
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

    public static compare(o1: Registry, o2: Registry): boolean {
        const s1 = o1.endpoint;
        const s2 = o2.endpoint;
        return s1 === s2;
    }
}