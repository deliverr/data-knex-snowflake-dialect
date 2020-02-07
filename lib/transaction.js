const Transaction = require('knex/lib/transaction');

module.exports = class Snowflake_Transaction extends Transaction {
  savepoint(conn) {
    this.trxClient.logger('Snowflake does not support savepoints.');
    return Promise.resolve();
  }

  release(conn, value) {
    this.trxClient.logger('Snowflake does not support savepoints.');
    return Promise.resolve();
  }

  rollbackTo(conn, error) {
    this.trxClient.logger('Snowflake does not support savepoints.');
    return Promise.resolve();
  }
};
