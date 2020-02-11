"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
// @ts-ignore
const Client = require("knex/lib/client");
const lodash_1 = require("lodash");
const Transaction_1 = require("./Transaction");
const QueryCompiler_1 = require("./query/QueryCompiler");
const ColumnBuilder_1 = require("./schema/ColumnBuilder");
const util_1 = require("util");
class SnowflakeDialect extends Client {
    constructor(config = {}) {
        if (config.connection) {
            if (config.connection.user && !config.connection.username) {
                config.connection.username = config.connection.user;
            }
            if (config.connection.host) {
                const [account, region] = config.connection.host.split('.');
                if (!config.connection.account) {
                    config.connection.account = account;
                }
                if (!config.connection.region) {
                    config.connection.region = region;
                }
            }
        }
        super(config);
    }
    get dialect() {
        return "snowflake";
    }
    get driverName() {
        return "snowflake-sdk";
    }
    transaction() {
        return new Transaction_1.SnowflakeTransaction();
    }
    queryCompiler() {
        // @ts-ignore
        return new QueryCompiler_1.QueryCompiler(this.client, this.builder);
    }
    columnBuilder() {
        return new ColumnBuilder_1.SnowflakeColumnBuilder();
    }
    /** The following will likely be needed, but have not yet been implemented
    columnCompiler() {
      return new ColumnCompiler(this, ...arguments);
    },
  
    tableCompiler() {
      return new TableCompiler(this, ...arguments);
    },
  
    schemaCompiler() {
      return new SchemaCompiler(this, ...arguments);
    },
    **/
    _driver() {
        const Snowflake = require("snowflake-sdk");
        return Snowflake;
    }
    // Get a raw connection, called by the `pool` whenever a new
    // connection needs to be added to the pool.
    acquireRawConnection() {
        return new Bluebird((resolver, rejecter) => {
            // @ts-ignore
            const connection = this.driver.createConnection(this.connectionSettings);
            connection.on('error', (err) => {
                connection.__knex__disposed = err;
            });
            connection.connect((err) => {
                if (err) {
                    // if connection is rejected, remove listener that was registered above...
                    connection.removeAllListeners();
                    return rejecter(err);
                }
                resolver(connection);
            });
        });
    }
    // Used to explicitly close a connection, called internally by the pool
    // when a connection times out or the pool is shutdown.
    async destroyRawConnection(connection) {
        try {
            const end = util_1.promisify((cb) => connection.end(cb));
            return await end();
        }
        catch (err) {
            connection.__knex__disposed = err;
        }
        finally {
            // see discussion https://github.com/knex/knex/pull/3483
            lodash_1.defer(() => connection.removeAllListeners());
        }
    }
    validateConnection(connection) {
        if (connection) {
            return true;
        }
        return false;
    }
    // Runs the query on the specified connection, providing the bindings
    // and any other necessary prep work.
    _query(connection, obj) {
        if (!obj || typeof obj === 'string')
            obj = { sql: obj };
        return new Bluebird(function (resolver, rejecter) {
            if (!obj.sql) {
                resolver();
                return;
            }
            const queryOptions = Object.assign({ sqlText: obj.sql, binds: obj.bindings, complete: function (err, statement, rows) {
                    if (err)
                        return rejecter(err);
                    obj.response = { rows, statement };
                    resolver(obj);
                } }, obj.options);
            connection.execute(queryOptions);
        });
    }
    // Ensures the response is returned in the same format as other clients.
    processResponse(obj, runner) {
        const resp = obj.response;
        if (obj.output)
            return obj.output.call(runner, resp);
        if (obj.method === 'raw')
            return resp;
        if (resp.command === 'SELECT') {
            if (obj.method === 'first')
                return resp.rows[0];
            if (obj.method === 'pluck')
                return lodash_1.map(resp.rows, obj.pluck);
            return resp.rows;
        }
        if (resp.command === 'INSERT' ||
            resp.command === 'UPDATE' ||
            resp.command === 'DELETE') {
            return resp.rowCount;
        }
        return resp;
    }
}
exports.SnowflakeDialect = SnowflakeDialect;
//# sourceMappingURL=index.js.map