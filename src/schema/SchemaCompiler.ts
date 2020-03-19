// @ts-ignore
import * as SchemaCompiler_MySQL from "knex/lib/dialects/mysql/schema/compiler";

export class SchemaCompiler extends SchemaCompiler_MySQL {
  constructor(client: any, builder: any) {
    super(client, builder);
  }

  // Check whether a table exists on the query.
  hasTable(tableName: string) {
    const [ schema, table ] = tableName.includes(".") ? tableName.split(".") : [undefined, tableName];
    let sql = 'select * from information_schema.tables where table_name = ?';
    const bindings = [tableName];

    if (schema) {
      sql += ' and table_schema = ?';
      bindings.push(schema);
    } else {
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