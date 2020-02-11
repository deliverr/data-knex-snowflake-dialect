// @ts-ignore
import * as Transaction from "knex/lib/transaction";

export class SnowflakeTransaction extends Transaction {

  savepoint(conn: any) {
    // @ts-ignore
    this.trxClient.logger('Snowflake does not support savepoints.');
  }

  release(conn: any, value: any) {
    // @ts-ignore
    this.trxClient.logger('Snowflake does not support savepoints.');
  }

  rollbackTo(conn: any, error: any) {
    // @ts-ignore
    this.trxClient.logger('Snowflake does not support savepoints.');
  }

}
