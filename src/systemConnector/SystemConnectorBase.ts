import { valid as semverValid } from "semver";
import { Logger } from "../logger";
import { Manifest } from "../manifest";
import { Registry, RegistryType } from "../registry";
import { IClient, RFCClient } from "../client";
import { DEVCLASS, PGMID, SOBJ_NAME, TRKORR, TROBJTYPE } from "../client/components";
import { T100, TADIR, TDEVC, TMSCSYS } from "../client/struct";
import { COMMENT_OBJ, Transport } from "../transport";
import { TrmPackage } from "../trmPackage";
import { Connection } from "./Connection";
import { Login } from "./Login";
import { InstallPackage } from "./InstallPackage";
import { SapMessage } from "./SapMessage";
import * as components from "../client/components";
import * as struct from "../client/struct";
import { ISystemConnectorBase } from "./ISystemConnectorBase";

export abstract class SystemConnectorBase implements ISystemConnectorBase {

  public async getTransportStatus(trkorr: TRKORR): Promise<string> {
    const aTrkorrStatusCheck: any[] = (await this.readTable('E070',
      [{ fieldName: 'TRKORR' }, { fieldName: 'TRSTATUS' }],
      `TRKORR EQ '${trkorr}'`
    ));
    if (aTrkorrStatusCheck.length !== 1) {
      throw new Error(`Transport not found.`);
    } else {
      return aTrkorrStatusCheck[0].trstatus;
    }
  }

  protected abstract readTable(tableName: components.TABNAME, fields: struct.RFC_DB_FLD[], options?: string): Promise<any[]>;
}