import * as Bluebird from "bluebird";
// @ts-ignore
import * as Client from "knex/lib/client";
import { defer, map } from "lodash";

import { SnowflakeTransaction } from "./Transaction";
import { QueryCompiler } from "./query/QueryCompiler";
import { SnowflakeColumnBuilder } from "./schema/ColumnBuilder";
import { promisify } from "util";

export class SnowflakeDialect extends Client {
  constructor(config = {} as any) {
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

  public get dialect() {
    return "snowflake";
  }

  public get driverName() {
    return "snowflake-sdk";
  }

  transaction() {
    return new SnowflakeTransaction();
  }

  queryCompiler(builder: any) {
    // @ts-ignore
    return new QueryCompiler(this, builder);
  }

  columnBuilder() {
    return new SnowflakeColumnBuilder();
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
      const end = promisify((cb) => connection.end(cb));
      return await end();
    } catch (err) {
      connection.__knex__disposed = err;
    } finally {
      // see discussion https://github.com/knex/knex/pull/3483
      defer(() => connection.removeAllListeners());
    }
  }

  validateConnection(connection: any) {
    if (connection) {
      return true;
    }
    return false;
  }

  // Runs the query on the specified connection, providing the bindings
  // and any other necessary prep work.
  _query(connection: any, obj: any) {
    if (!obj || typeof obj === 'string') obj = { sql: obj };
    return new Bluebird(function(resolver: any, rejecter: any) {
      if (!obj.sql) {
        resolver();
        return;
      }

      const queryOptions =
          {
            sqlText: obj.sql,
            binds: obj.bindings,
            complete: function (err: any, statement: any, rows: any) {
              if (err) return rejecter(err);
              obj.response = {rows, statement};
              resolver(obj);
            },
            ...obj.options
          };
      connection.execute(queryOptions);
    });
  }

  // Ensures the response is returned in the same format as other clients.
  processResponse(obj: any, runner: any) {
    const resp = obj.response;
    if (obj.output) return obj.output.call(runner, resp);
    if (obj.method === 'raw') return resp;
    if (resp.command === 'SELECT') {
      if (obj.method === 'first') return resp.rows[0];
      if (obj.method === 'pluck') return map(resp.rows, obj.pluck);
      return resp.rows;
    }
    if (
      resp.command === 'INSERT' ||
      resp.command === 'UPDATE' ||
      resp.command === 'DELETE'
    ) {
      return resp.rowCount;
    }
    return resp;
  }

}
