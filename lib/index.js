"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bluebird = require("bluebird");
const Knex = require("knex");
const lodash_1 = require("lodash");
const QueryCompiler_1 = require("./query/QueryCompiler");
const schema_1 = require("./schema");
const ColumnBuilder = require("knex/lib/schema/columnbuilder");
const Transaction = require("knex/lib/transaction");
const util_1 = require("util");
class SnowflakeDialect extends Knex.Client {
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
    transaction(container, config, outerTx) {
        const transax = new Transaction(this, container, config, outerTx);
        transax.savepoint = (conn) => {
            // @ts-ignore
            transax.trxClient.logger('Snowflake does not support savepoints.');
        };
        transax.release = (conn, value) => {
            // @ts-ignore
            transax.trxClient.logger('Snowflake does not support savepoints.');
        };
        transax.rollbackTo = (conn, error) => {
            // @ts-ignore
            this.trxClient.logger('Snowflake does not support savepoints.');
        };
        return transax;
    }
    queryCompiler(builder) {
        return new QueryCompiler_1.QueryCompiler(this, builder);
    }
    columnBuilder(tableBuilder, type, args) {
        // ColumnBuilder methods are created at runtime, so that it does not play well with TypeScript.
        // So instead of extending ColumnBuilder, we override methods at runtime here
        const columnBuilder = new ColumnBuilder(this, tableBuilder, type, args);
        columnBuilder.primary = (constraintName) => {
            // @ts-ignore
            columnBuilder.notNullable();
            return columnBuilder;
        };
        columnBuilder.index = (indexName) => {
            // @ts-ignore
            columnBuilder.client.logger.warn('Snowflake does not support the creation of indexes.');
            return columnBuilder;
        };
        return columnBuilder;
    }
    /*columnCompiler(tableCompiler: any, columnBuilder: any) {
      return new ColumnCompiler_MySQL(this, tableCompiler.tableBuilder, columnBuilder);
    }*/
    tableCompiler(tableBuilder) {
        return new schema_1.TableCompiler(this, tableBuilder);
    }
    schemaCompiler(builder) {
        return new schema_1.SchemaCompiler(this, builder);
    }
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
            await end();
        }
        catch (err) {
            connection.__knex__disposed = err;
        }
        finally {
            // see discussion https://github.com/knex/knex/pull/3483
            lodash_1.defer(() => connection.removeAllListeners());
        }
    }
    async validateConnection(connection) {
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
        return new Bluebird((resolver, rejecter) => {
            if (!obj.sql) {
                resolver();
                return;
            }
            const queryOptions = Object.assign({ sqlText: obj.sql, binds: obj.bindings, complete(err, statement, rows) {
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
        if (resp.command === 'SELECT' || (resp.statement && resp.rows)) {
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
    customWrapIdentifier(value, origImpl, queryContext) {
        if (this.config.wrapIdentifier) {
            return this.config.wrapIdentifier(value, origImpl, queryContext);
        }
        else if (!value.startsWith('"')) {
            return origImpl(value.toUpperCase());
        }
        return origImpl;
    }
}
exports.SnowflakeDialect = SnowflakeDialect;
//# sourceMappingURL=index.js.map