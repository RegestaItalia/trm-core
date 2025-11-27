import { PGMID, SOBJ_NAME, TROBJTYPE, ZTRM_OBJECT_DEPENDENCY } from "../client";

export class ObjectDependencies {

    public readonly tadir: {
        pgmid: string,
        object: string,
        obj_name: string
    }[] = [];
    public readonly tfdir: {
        funcname: string
    }[] = [];

    constructor(public readonly pgmid: PGMID, public readonly object: TROBJTYPE, public readonly objName: SOBJ_NAME, dependencies: ZTRM_OBJECT_DEPENDENCY[]) {
        dependencies.forEach(d => {
            switch (d.tabname) {
                case 'TADIR':
                    this.addTadir(d.tabkey);
                    break;
                case 'TFDIR':
                    this.addTfdir(d.tabkey);
                    break;
                default:
                    throw new Error(`Unhandled dependency with "${d.tabname}"`);
            }
        });
    }

    private addTadir(key: string) {
        const [pgmid, object, obj_name] = [key.slice(0, 4), key.slice(4, 8), key.slice(8, 48)];
        this.tadir.push({
            pgmid,
            object,
            obj_name
        });
    }

    private addTfdir(key: string) {
        const [funcname] = [key.slice(0, 30)];
        this.tfdir.push({
            funcname
        });
    }
}