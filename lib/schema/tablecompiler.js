/* eslint max-len: 0 */

// Snowflake Table Builder & Compiler
// -------

const inherits = require('inherits');
const { has } = require('lodash');
const TableCompiler_MySQL = require('knex/lib/dialects/mysql/schema/tablecompiler');

function TableCompiler_Snowflake() {
  TableCompiler_MySQL.apply(this, arguments);
}
inherits(TableCompiler_Snowflake, TableCompiler_MySQL);

TableCompiler_Snowflake.prototype.index = function(
  columns,
  indexName,
  indexType
) {
  this.client.logger.warn(
    'Snowflake does not support the creation of indexes.'
  );
};

TableCompiler_Snowflake.prototype.dropIndex = function(columns, indexName) {
  this.client.logger.warn(
    'Snowflake does not support the deletion of indexes.'
  );
};

// TODO: have to disable setting not null on columns that already exist...

// Adds the "create" query to the query sequence.
TableCompiler_Snowflake.prototype.createQuery = function(columns, ifNot) {
  const createStatement = ifNot
    ? 'create table if not exists '
    : 'create table ';
  let sql =
    createStatement + this.tableName() + ' (' + columns.sql.join(', ') + ')';
  if (this.single.inherits)
    sql += ` like (${this.formatter.wrap(this.single.inherits)})`;
  this.pushQuery({
    sql,
    bindings: columns.bindings,
  });
  const hasComment = has(this.single, 'comment');
  if (hasComment) this.comment(this.single.comment);
};

TableCompiler_Snowflake.prototype.primary = function(columns, constraintName) {
  const self = this;
  constraintName = constraintName
    ? self.formatter.wrap(constraintName)
    : self.formatter.wrap(`${this.tableNameRaw}_pkey`);
  if (columns.constructor !== Array) {
    columns = [columns];
  }
  const thiscolumns = self.grouped.columns;

  if (thiscolumns) {
    for (let i = 0; i < columns.length; i++) {
      let exists = thiscolumns.find(
        (tcb) =>
          tcb.grouping === 'columns' &&
          tcb.builder &&
          tcb.builder._method === 'add' &&
          tcb.builder._args &&
          tcb.builder._args.indexOf(columns[i]) > -1
      );
      if (exists) {
        exists = exists.builder;
      }
      const nullable = !(
        exists &&
        exists._modifiers &&
        exists._modifiers['nullable'] &&
        exists._modifiers['nullable'][0] === false
      );
      if (nullable) {
        if (exists) {
          return this.client.logger.warn(
            'Snowflake does not allow primary keys to contain nullable columns.'
          );
        } else {
          return this.client.logger.warn(
            'Snowflake does not allow primary keys to contain nonexistent columns.'
          );
        }
      }
    }
  }
  return self.pushQuery(
    `alter table ${self.tableName()} add constraint ${constraintName} primary key (${self.formatter.columnize(
      columns
    )})`
  );
};

module.exports = TableCompiler_Snowflake;
