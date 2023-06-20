// @ts-ignore
import * as SchemaCompiler_MySQL from "knex/lib/dialects/mysql/schema/mysql-compiler";

export class SchemaCompiler extends SchemaCompiler_MySQL {
  constructor(client: any, builder: any) {
    super(client, builder);
  }

  // Rename a table on the schema.
  renameTable(tableName, to) {
    // @ts-ignore
    this.pushQuery(
        // @ts-ignore
        `alter table ${this.formatter.wrap(tableName)} rename to ${this.formatter.wrap(
            to
        )}`
    );
  }

  // Check whether a table exists on the query.
  hasTable(tableName: string) {
    const [ schemaFromTable, table ] = tableName.includes(".") ? tableName.split(".") : [undefined, tableName];
    let sql = 'select * from information_schema.tables where table_name = ?';
    const bindings = [table.toUpperCase()];
    let schema;
    if (schemaFromTable) {
      schema = schemaFromTable.toUpperCase();
      sql += ' and table_schema = ?';
      bindings.push(schema);
      // @ts-ignore
    } else if (this.client.connectionSettings.schema) {
      // @ts-ignore
      schema = this.client.connectionSettings.schema.toUpperCase();
      sql += ' and table_schema = ?';
      bindings.push(schema);
    } else {
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
