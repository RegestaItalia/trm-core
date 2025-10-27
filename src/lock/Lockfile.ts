export interface Lockfile {
    lockfileVersion: number,
    name?: string,
    version?: string,
    packages?: {
        name: string,
        version: string,
        registry: string,
        integrity: string
    }[]
}