export interface IUserExit {
    prevUserExit: {
        module: string,
        result: any
    }[]

    prova: () => string

    provaPromise: () => Promise<string>
}