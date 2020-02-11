"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const Transaction = require("knex/lib/transaction");
class SnowflakeTransaction extends Transaction {
    savepoint(conn) {
        // @ts-ignore
        this.trxClient.logger('Snowflake does not support savepoints.');
    }
    release(conn, value) {
        // @ts-ignore
        this.trxClient.logger('Snowflake does not support savepoints.');
    }
    rollbackTo(conn, error) {
        // @ts-ignore
        this.trxClient.logger('Snowflake does not support savepoints.');
    }
}
exports.SnowflakeTransaction = SnowflakeTransaction;
//# sourceMappingURL=Transaction.js.map