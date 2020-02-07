const inherits = require('inherits');
const ColumnBuilder = require('knex/lib/schema/columnbuilder');

function ColumnBuilder_Snowflake() {
  ColumnBuilder.apply(this, arguments);
}
inherits(ColumnBuilder_Snowflake, ColumnBuilder);

// primary needs to set not null on non-preexisting columns, or fail
ColumnBuilder_Snowflake.prototype.primary = function() {
  this.notNullable();
  return ColumnBuilder.prototype.primary.apply(this, arguments);
};

ColumnBuilder_Snowflake.prototype.index = function() {
  this.client.logger.warn(
    'Snowflake does not support the creation of indexes.'
  );
  return this;
};

module.exports = ColumnBuilder_Snowflake;
