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
        const bindings = [table.toUpperCase()];
        if (schema) {
            sql += ' and table_schema = ?';
            bindings.push(schema.toUpperCase());
        }
        else {
            sql += ' and table_schema = current_schema()';
        }
        // @ts-ignore
        this.pushQuery({
            sql,
            bindings,
            output: (resp) => resp.rows.length > 0
        });
    }
}
exports.SchemaCompiler = SchemaCompiler;
//# sourceMappingURL=SchemaCompiler.js.map