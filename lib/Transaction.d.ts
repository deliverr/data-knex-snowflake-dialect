// @ts-ignore
import * as Transaction from "knex/lib/transaction";
export declare class SnowflakeTransaction extends Transaction {
    savepoint(conn: any): void;
    release(conn: any, value: any): void;
    rollbackTo(conn: any, error: any): void;
}
