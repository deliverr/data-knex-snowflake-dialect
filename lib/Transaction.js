"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const Transaction = require("knex/lib/transaction");
class SnowflakeTransaction extends Transaction {
    savepoint(conn) {
        super.trxClient.logger('Snowflake does not support savepoints.');
    }
    release(conn, value) {
        super.trxClient.logger('Snowflake does not support savepoints.');
    }
    rollbackTo(conn, error) {
        super.trxClient.logger('Snowflake does not support savepoints.');
    }
}
exports.SnowflakeTransaction = SnowflakeTransaction;
//# sourceMappingURL=Transaction.js.map