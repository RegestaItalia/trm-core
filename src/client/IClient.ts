export interface IClient {
    open: () => Promise<void>,
    checkConnection: () => Promise<boolean>
}