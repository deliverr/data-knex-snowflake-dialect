// @ts-ignore
import * as Transaction from "knex/lib/transaction";

export class SnowflakeTransaction extends Transaction {

  savepoint(conn: any) {
    super.trxClient.logger('Snowflake does not support savepoints.');
  }

  release(conn: any, value: any) {
    super.trxClient.logger('Snowflake does not support savepoints.');
  }

  rollbackTo(conn: any, error: any) {
    super.trxClient.logger('Snowflake does not support savepoints.');
  }

}
