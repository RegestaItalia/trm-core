export function adjustTrmServerRestDevclass(devclass: string): string {
    return devclass.replace(new RegExp(`^/ATRM/SERVER`, 'gmi'), '$TRM').replace(new RegExp(`^/ATRM/REST`, 'gmi'), '$TRM_REST');
}