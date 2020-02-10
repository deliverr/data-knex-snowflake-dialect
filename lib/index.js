"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const inherits = require('inherits');
const Client = require('knex/lib/client');
const Client_MySQL = require('knex/lib/dialects/mysql');
const { map } = require('lodash');

const Bluebird = require('bluebird');
const Transaction = require('./transaction');
const QueryCompiler = require('./query/compiler');
const ColumnBuilder = require('./schema/columnbuilder');
const ColumnCompiler = require('./schema/columncompiler');
const TableCompiler = require('./schema/tablecompiler');
const SchemaCompiler = require('./schema/compiler');

function SnowflakeDialect(config) {
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
  Client.apply(this, arguments);
}
inherits(SnowflakeDialect, Client);

Object.assign(SnowflakeDialect.prototype, {
  transaction() {
    return new Transaction(this, ...arguments);
  },

  queryCompiler() {
    return new QueryCompiler(this, ...arguments);
  },

  columnBuilder() {
    return new ColumnBuilder(this, ...arguments);
  },

  columnCompiler() {
    return new ColumnCompiler(this, ...arguments);
  },

  tableCompiler() {
    return new TableCompiler(this, ...arguments);
  },

  schemaCompiler() {
    return new SchemaCompiler(this, ...arguments);
  },

  dialect: 'snowflake',

  driverName: 'snowflake-sdk',

  _driver() {
    return require('snowflake-sdk');
  },

  validateConnection(connection) {
    if (connection) {
      return true;
    }
    return false;
  },

  // Runs the query on the specified connection, providing the bindings
  // and any other necessary prep work.
  _query(connection, obj) {
    if (!obj || typeof obj === 'string') obj = { sql: obj };
    return new Bluebird(function(resolver, rejecter) {
      if (!obj.sql) {
        resolver();
        return;
      }

      const queryOptions = Object.assign(
        {
          sqlText: obj.sql,
          binds: obj.bindings,
          complete: function(err, statement, rows) {
            if (err) return rejecter(err);
            obj.response = { rows, statement };
            resolver(obj);
          },
        },
        obj.options
      );
      connection.execute(queryOptions);
    });
  },

  // Ensures the response is returned in the same format as other clients.
  processResponse(obj, runner) {
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
  },
});

module.exports = SnowflakeDialect;
