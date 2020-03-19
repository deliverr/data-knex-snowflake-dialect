"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const SchemaCompiler_MySQL = require("knex/lib/dialects/mysql/schema/compiler");
class SchemaCompiler extends SchemaCompiler_MySQL {
    constructor(client, builder) {
        super(client, builder);
    }
    // Check whether a table exists on the query.
    hasTable(tableName) {
        const [schema, table] = tableName.includes(".") ? tableName.split(".") : [undefined, tableName];
        let sql = 'select * from information_schema.tables where table_name = ?';
        const bindings = [tableName];
        if (schema) {
            sql += ' and table_schema = ?';
            bindings.push(schema);
        }
        else {
            sql += ' and table_schema = current_schema()';
        }
        // @ts-ignore
        this.pushQuery({
            sql: sql,
            bindings: bindings,
            output: function output(resp) {
                return resp.length > 0;
            }
        });
    }
}
exports.SchemaCompiler = SchemaCompiler;
//# sourceMappingURL=SchemaCompiler.js.map