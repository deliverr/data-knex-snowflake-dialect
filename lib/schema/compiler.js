/* eslint max-len: 0 */

// Snowflake Table Builder & Compiler
// -------

const inherits = require('inherits');
const SchemaCompiler_MySQL = require('knex/lib/dialects/mysql/schema/compiler');

function SchemaCompiler_Snowflake() {
  SchemaCompiler_MySQL.apply(this, arguments);
}
inherits(SchemaCompiler_Snowflake, SchemaCompiler_MySQL);

module.exports = SchemaCompiler_Snowflake;
