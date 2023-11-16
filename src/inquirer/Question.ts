export type Question = {
    type: any,
    message: any,
    name: any,
    default?: any,
    validate?: any,
    choices?: any[],
    when?: any,
    pageSize?: number,
    expanded?: boolean,
    postfix?: string
}