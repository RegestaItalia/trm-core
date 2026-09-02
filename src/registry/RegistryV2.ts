import { RegistryType } from "./RegistryType";
import normalizeUrl from "@esm2cjs/normalize-url";
import { AxiosError, AxiosHeaders, AxiosInstance, CreateAxiosDefaults } from "axios";
import { AuthOAuth2, AuthenticationType, BatchCompareRequest, BatchCompareResponse, Deprecate, DistTagAdd, DistTagRm, OAuth2Data, Package, Ping, Publish, TransportDownload, WhoAmI } from "trm-registry-types";
import { TrmArtifact } from "../trmPackage/TrmArtifact";
import * as FormData from "form-data";
import { Logger, Inquirer } from "trm-commons";
import { createHash, randomUUID } from "crypto";
import { Protocol } from "../protocol";
import opener from "opener";
import { OAuth2Body } from "trm-registry-types";
import _, { add } from 'lodash';
import { getAxiosInstance, getNodePackage, normalize } from "../commons";
import { AbstractRegistry, PublishAdditionalData } from "./AbstractRegistry";
import NodeCache from "node-cache";
import { BinaryTransport } from "../transport";
import * as AdmZip from "adm-zip";
import { RegistryPackageNotFoundError } from "./RegistryPackageNotFoundError";
import { RegistryDeletionTransportUnauthorizedError } from "./RegistryDeletionTransportUnauthorizedError";

const AXIOS_CTX = "RegistryV2";

export const PUBLIC_RESERVED_KEYWORD = 'public';

export class RegistryV2 implements AbstractRegistry {
    private _cache: NodeCache = new NodeCache({ stdTTL: 60, useClones: false });
    private _registryType: RegistryType;
    private _axiosInstance: AxiosInstance;
    private _authData: any;
    private _userAgent: string;

    constructor(public endpoint: string, public name: string = 'Unknown', private _coreVersion?: string) {
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

    private getDefaultAxiosHeaders(): any {
        var axiosHeaders = new AxiosHeaders();
        if (!this._userAgent) {
            try {
                this._userAgent = `trm-core v${this._coreVersion || getNodePackage().version}`;
            } catch {
                this._userAgent = `trm-core with unknown version`
            }
        }
        axiosHeaders.setUserAgent(this._userAgent);
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
        var axiosHeaders = this.getDefaultAxiosHeaders();
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
        var axiosHeaders = this.getDefaultAxiosHeaders();
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
                        const tokenResponse = await (getAxiosInstance({
                            baseURL: this.endpoint
                        }, AXIOS_CTX)).post<AuthOAuth2>('/auth', oAuth2Request);
                        this.assertStatus(tokenResponse.status, [200], 'OAuth token refresh');
                        oAuth2Response = tokenResponse.data;
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
                const tokenResponse = await (getAxiosInstance({
                    baseURL: this.endpoint
                }, AXIOS_CTX)).post<AuthOAuth2>('/auth', oAuth2Request);
                this.assertStatus(tokenResponse.status, [200], 'OAuth token exchange');
                oAuth2Response = tokenResponse.data;
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
        var axiosHeaders = this.getDefaultAxiosHeaders();
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

    private assertStatus(status: number, expected: number[], operation: string): void {
        if (!expected.includes(status)) {
            throw new Error(`${operation} returned unexpected HTTP status ${status}; expected ${expected.join(' or ')}.`);
        }
    }

    private getErrorStatus(error: unknown): number | undefined {
        const registryError = error as {
            status?: number;
            response?: { status?: number };
            axiosError?: AxiosError;
        };
        return registryError.status
            ?? registryError.response?.status
            ?? registryError.axiosError?.response?.status;
    }

    public async ping(): Promise<Ping> {
        var data: Ping | Error = this._cache.get('ping');
        if (!data) {
            try {
                const response = await this._axiosInstance.get('/', {
                    headers: {}
                });
                this.assertStatus(response.status, [200], 'Registry metadata request');
                data = response.data;
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
                const response = await this._axiosInstance.get('/whoami');
                this.assertStatus(response.status, [200], 'Registry identity request');
                data = response.data;
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

    public async getPackage(fullName: string, version: string = 'latest', refresh: boolean = false): Promise<Package> {
        const cacheKey = this.getPackageCacheKey(fullName, version);
        if (refresh) {
            this._cache.del(cacheKey);
        }
        var data: Package | Error = this._cache.get(cacheKey);
        if (!data) {
            var ttl: number;
            try {
                const response = await this._axiosInstance.get(`/package/${fullName}`, {
                    params: {
                        version
                    }
                });
                this.assertStatus(response.status, [200], 'Package metadata request');
                data = response.data;
                if ((data as Package).download_link_expiry) {
                    try {
                        ttl = Math.max(0, Math.floor(((data as Package).download_link_expiry - Date.now()) / 1000));
                    } catch { }
                }
            } catch (e) {
                data = this.getErrorStatus(e) === 404
                    ? new RegistryPackageNotFoundError(fullName, version, this.endpoint, e)
                    : e;
            }
            // A failed refresh must not poison the cache. In particular, a
            // transient ECONNRESET should allow the caller to retry the GET.
            if (!(data instanceof Error)) {
                if (ttl === undefined || ttl > 0) {
                    this._cache.set(cacheKey, data, ttl);
                }
            }
        }
        if (data instanceof Error) {
            throw data;
        } else {
            return data;
        }
    }

    private getPackageCacheKey(fullName: string, version: string): string {
        return `package-${fullName}-${version}`;
    }

    public async transportEntries(fullName: string, version: string, trkorr: string): Promise<any> {
        const download = async (refreshPackage: boolean = false): Promise<any> => {
            let packageData: Package;
            try {
                packageData = await this.getPackage(fullName, version, refreshPackage);
            } catch (e) {
                // Signed links are commonly refreshed after the HTTP connection
                // has been idle. Retry this safe metadata GET once if that stale
                // connection was reset; Axios retains the instance auth headers.
                if (refreshPackage && (e as AxiosError).code === 'ECONNRESET') {
                    packageData = await this.getPackage(fullName, version, true);
                } else {
                    throw e;
                }
            }
            const transport = packageData.transports.find(o => o.trkorr === trkorr);
            if (!transport) {
                throw new Error(`Transport ${trkorr} was not found in package ${fullName} ${version}.`);
            }

            if (!refreshPackage && transport.contents.download_link_expiry && transport.contents.download_link_expiry <= Date.now()) {
                return download(true);
            }

            try {
                return normalize((await this._axiosInstance.get(transport.contents.download_link)).data || {});
            } catch (e) {
                const status = this.getErrorStatus(e);
                if (!refreshPackage && (status === 401 || status === 403)) {
                    return download(true);
                }
                throw e;
            }
        };

        return download();
    }

    public async downloadArtifact(fullName: string, version: string = 'latest'): Promise<TrmArtifact> {
        const packageData = await this.getPackage(fullName, version);
        const chunks: Buffer[] = [];
        let buffer: Buffer;
        const logProgress = Logger.progressbar(`↓ ${fullName} ${version} [{bar}] {percentage}% | {value}/{total} bytes`, '>');

        try {
            const response = await this._axiosInstance.get(packageData.download_link, {
                headers: {
                    Accept: 'application/octet-stream',
                },
                maxRedirects: 10,
                responseType: 'stream',
                validateStatus: s => s >= 200 && s < 400,
            });

            const totalBytes = Number(response.headers['content-length'] ?? 0);
            let downloadedBytes = 0;

            if (totalBytes > 0) {
                logProgress.start(totalBytes, 0);
            }

            await new Promise<void>((resolve, reject) => {
                response.data.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                    downloadedBytes += chunk.length;

                    if (totalBytes > 0) {
                        logProgress.update(downloadedBytes);
                    }
                });

                response.data.on('end', () => resolve());
                response.data.on('error', reject);
            });

            if (totalBytes > 0) {
                logProgress.stop();
            }

            buffer = Buffer.concat(chunks);
        } catch (e) {
            try {
                logProgress.stop();
            } catch {
                // ignore stop errors
            }

            Logger.error((e as Error).toString(), true);
            Logger.error(`Failed to fetch package at ${packageData.download_link}: ${(e as AxiosError).message}`);
            throw e;
        }

        return new TrmArtifact(buffer);
    }

    public async validatePublish(fullName: string, version: string = 'latest', isPrivate: boolean): Promise<void> {
        const status = (await this._axiosInstance.get(`/publish/check/${fullName}`, {
            params: {
                version,
                private: isPrivate ? 'X' : 'N'
            }
        })).status;
        if (status !== 204) {
            throw new Error(`Package cannot be published`);
        }
    }

    public async publish(fullName: string, version: string, artifact: TrmArtifact, additionalData?: PublishAdditionalData): Promise<void> {
        const fileName = `${fullName}_v${version}`.replace('.', '_') + '.trm';
        const formData = new FormData.default();
        formData.append('artifact', artifact.binary, {
            filename: fileName,
            contentType: 'application/octet-stream'
        });
        if (additionalData && additionalData.readme) {
            formData.append('readme', Buffer.from(additionalData.readme), {
                filename: 'readme.md',
                contentType: 'text/markdown'
            });
        }
        if (additionalData && additionalData.changelog) {
            formData.append('changelog', Buffer.from(additionalData.changelog), {
                filename: 'changelog.md',
                contentType: 'text/markdown'
            });
        }
        if(additionalData && additionalData.retainedCustomizing){
            formData.append('retainedCustomizing', JSON.stringify(additionalData.retainedCustomizing));
        }
        var params = { version, tags: additionalData && additionalData.tags ? additionalData.tags : undefined };
        if (!params.tags) {
            delete params.tags;
        }
        const response = await this._axiosInstance.post<Publish>(`/publish/${fullName}`, formData, {
            params,
            headers: formData.getHeaders()
        });

        this.assertStatus(response.status, [201, 202], 'Publish request');

        if (response.status === 202) { //publish is async
            let publishStatus = response.data;
            const progressPoolUrl = publishStatus.progress_pool_url;
            const logProgress = Logger.progressbar(`↑ ${fullName} ${version} [{bar}] {value}/{total} {message} | Last refresh: {lastRefresh}`, '>');

            logProgress.start(publishStatus.steps, publishStatus.current_step, {
                message: publishStatus.current_step_message || '',
                lastRefresh: new Date().toLocaleTimeString()
            });

            try {
                while (publishStatus.current_step < publishStatus.steps) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    publishStatus = (await this._axiosInstance.get<Publish>(progressPoolUrl)).data;
                    logProgress.update(publishStatus.current_step, {
                        message: publishStatus.current_step_message || '',
                        lastRefresh: new Date().toLocaleTimeString()
                    });
                }
            } catch (e) {
                Logger.error(e.toString());
                Logger.warning(`Unable to check status on registry, check manually`);
            } finally {
                logProgress.stop();
            }
        }
    }

    public async unpublish(fullName: string, version: string): Promise<void> {
        const response = await this._axiosInstance.post(`/unpublish/${fullName}`, null, {
            params: {
                version
            }
        });
        this.assertStatus(response.status, [204], 'Unpublish request');
    }

    public async deprecate(fullName: string, version: string, deprecate: Deprecate): Promise<void> {
        const response = await this._axiosInstance.post(`/deprecate/${fullName}`, {
            deprecate_note: deprecate.deprecate_note
        }, {
            params: {
                version
            }
        });
        this.assertStatus(response.status, [204], 'Deprecate request');
    }

    public async addDistTag(fullName: string, distTag: DistTagAdd): Promise<void> {
        const status = (await this._axiosInstance.put(`/package/tag/${fullName}`, distTag)).status;
        if (status !== 204) {
            throw new Error(`Cannot add tag "${distTag.tag.trim().toUpperCase()}"`);
        }
    }

    public async rmDistTag(fullName: string, distTag: DistTagRm): Promise<void> {
        const status = (await this._axiosInstance.delete(`/package/tag/${fullName}`, {
            data: distTag
        })).status;
        if (status !== 204) {
            throw new Error(`Cannot remove tag "${distTag.tag.trim().toLowerCase()}"`);
        }
    }

    public async batchCompare(packages: BatchCompareRequest): Promise<BatchCompareResponse> {
        const response = await this._axiosInstance.post('/batchCompare', packages);
        this.assertStatus(response.status, [200], 'Batch comparison request');
        return response.data;
    }

    public async delete(transport: BinaryTransport): Promise<BinaryTransport> {
        const formData = new FormData.default();
        formData.append('header', transport.header, {
            filename: 'header',
            contentType: 'application/octet-stream'
        });
        formData.append('data', transport.data, {
            filename: 'data',
            contentType: 'application/octet-stream'
        });

        let deleteResponse;
        try {
            deleteResponse = await this._axiosInstance.post<TransportDownload>('/delete', formData, {
                headers: formData.getHeaders()
            });
        } catch (e) {
            if (this.getErrorStatus(e) === 401) {
                throw new RegistryDeletionTransportUnauthorizedError(this.endpoint, e);
            }
            throw e;
        }
        this.assertStatus(deleteResponse.status, [200], 'Deletion transport request');
        const transportDownload = deleteResponse.data;

        const chunks: Buffer[] = [];
        let buffer: Buffer;
        const ping: Ping | undefined = this._cache.get('ping') && !(this._cache.get('ping') instanceof Error) ? this._cache.get('ping') : undefined;
        const logProgress = Logger.progressbar(`↓ deletion transport [{bar}] {percentage}% | {value}/{total} bytes`, '>');

        try {
            const response = await this._axiosInstance.get(transportDownload.download_link, {
                headers: {
                    Accept: 'application/octet-stream'
                },
                maxRedirects: 10,
                responseType: 'stream',
                validateStatus: s => s >= 200 && s < 400
            });

            const totalBytes = Number(response.headers['content-length'] ?? 0);
            let downloadedBytes = 0;

            if (totalBytes > 0) {
                logProgress.start(totalBytes, 0);
            }

            await new Promise<void>((resolve, reject) => {
                response.data.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                    downloadedBytes += chunk.length;

                    if (totalBytes > 0) {
                        logProgress.update(downloadedBytes);
                    }
                });
                response.data.on('end', resolve);
                response.data.on('error', reject);
            });

            if (totalBytes > 0) {
                logProgress.stop();
            }
            buffer = Buffer.concat(chunks);
        } catch (e) {
            try {
                logProgress.stop();
            } catch {
                // ignore stop errors
            }

            Logger.error((e as Error).toString(), true);
            Logger.error(`Failed to download deletion transport at ${transportDownload.download_link}: ${(e as AxiosError).message}`);
            throw e;
        }

        const checksum = createHash('sha512').update(buffer).digest('base64');
        if (checksum !== transportDownload.checksum) {
            Logger.error(`SECURITY ISSUE! Deletion transport integrity does NOT match!`);
            Logger.error(`SECURITY ISSUE! Expected SHA is ${transportDownload.checksum}, received SHA is ${checksum}`);
            Logger.error(`SECURITY ISSUE! Please, report the issue to ${this.ping && ping.alert_email ? ping.alert_email : 'registry support team'}`);
            throw new Error(`Cannot continue due to security issues.`);
        }

        const zip = new AdmZip.default(buffer);
        const kFile = zip.getEntries().find(o => o.name.startsWith('K'));
        const rFile = zip.getEntries().find(o => o.name.startsWith('R'));
        if (!kFile) {
            throw new Error(`Missing header in deletion transport!`);
        }
        if (!rFile) {
            throw new Error(`Missing data in deletion transport!`);
        }

        return {
            header: kFile.getData(),
            data: rFile.getData()
        };
    }

    public async transport(trkorr: string, target?: string): Promise<BinaryTransport> {
        const response = await this._axiosInstance.get<TransportDownload>(`/transport/${trkorr}`, {
            params: {
                target: target || undefined
            }
        });
        this.assertStatus(response.status, [200], 'Transport request');
        const transportDownload = response.data;

        return this.downloadTransport(transportDownload, trkorr);
    }

    private async downloadTransport(transportDownload: TransportDownload, label: string): Promise<BinaryTransport> {
        const chunks: Buffer[] = [];
        let buffer: Buffer;
        //from cache if it exists, else ignore
        const ping: Ping | undefined = this._cache.get('ping') && !(this._cache.get('ping') instanceof Error) ? this._cache.get('ping') : undefined;

        const logProgress = Logger.progressbar(`↓ ${label} [{bar}] {percentage}% | {value}/{total} bytes`, '>');

        try {
            const response = await this._axiosInstance.get(transportDownload.download_link, {
                headers: {
                    Accept: 'application/octet-stream',
                },
                maxRedirects: 10,
                responseType: 'stream',
                validateStatus: s => s >= 200 && s < 400,
            });

            const totalBytes = Number(response.headers['content-length'] ?? 0);
            let downloadedBytes = 0;

            if (totalBytes > 0) {
                logProgress.start(totalBytes, 0);
            }

            await new Promise<void>((resolve, reject) => {
                response.data.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                    downloadedBytes += chunk.length;

                    if (totalBytes > 0) {
                        logProgress.update(downloadedBytes);
                    }
                });

                response.data.on('end', () => resolve());
                response.data.on('error', reject);
            });

            if (totalBytes > 0) {
                logProgress.stop();
            }
            buffer = Buffer.concat(chunks);
        } catch (e) {
            try {
                logProgress.stop();
            } catch {
                // ignore stop errors
            }

            Logger.error((e as Error).toString(), true);
            Logger.error(`Failed to download transport at ${transportDownload.download_link}: ${(e as AxiosError).message}`);
            throw e;
        }
        const checksum = createHash("sha512").update(buffer).digest("base64");
        if (checksum !== transportDownload.checksum) {
            Logger.error(`SECURITY ISSUE! Transport ${label} integrity does NOT match!`);
            Logger.error(`SECURITY ISSUE! Expected SHA is ${transportDownload.checksum}, received SHA is ${checksum}`);
            Logger.error(`SECURITY ISSUE! Please, report the issue to ${this.ping && ping.alert_email ? ping.alert_email : 'registry support team'}`);
            throw new Error(`Cannot continue due to security issues.`);
        }
        const zip = new AdmZip.default(buffer);
        //we can't assume custom registries will mark K and R file with comment in zip
        //keeping it simple here with name starts with
        const kFile = zip.getEntries().find(o => o.name.startsWith('K'));
        const rFile = zip.getEntries().find(o => o.name.startsWith('R'));
        if (!kFile) {
            throw new Error(`Missing header in transport!`);
        }
        if (!rFile) {
            throw new Error(`Missing data in transport!`);
        }
        return {
            header: kFile.getData(),
            data: rFile.getData()
        };
    }

}
