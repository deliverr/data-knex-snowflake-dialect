// @ts-ignore
import * as QueryCompiler_MySQL from "knex/lib/dialects/mysql/query/mysql-querycompiler";

export class QueryCompiler extends QueryCompiler_MySQL {
  constructor(client: any, builder: any, formatter: any) {
    super(client, builder, formatter);
  }

  forUpdate() {
    // @ts-ignore
    this.client.logger.warn('table lock is not supported by snowflake dialect');
    return '';
  }

  forShare() {
    // @ts-ignore
    this.client.logger.warn(
      'lock for share is not supported by snowflake dialect'
    );
    return '';
  }

  columnInfo() {
    // @ts-ignore
    const column = this.single.columnInfo;
    // @ts-ignore
    const tableName = (this.single.table as string).toUpperCase();
    const [ schemaFromTable, table ] = tableName.includes(".") ? tableName.split(".") : [undefined, tableName];
    let sql = 'select * from information_schema.columns where table_name = ?';
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
    return {
      sql,
      // @ts-ignore
      bindings,
      output(resp) {
        const out = resp.rows.reduce((columns, val) => {
          columns[val.COLUMN_NAME] = {
            defaultValue: val.COLUMN_DEFAULT === 'NULL' ? null : val.COLUMN_DEFAULT,
            type: val.DATA_TYPE,
            maxLength: val.CHARACTER_MAXIMUM_LENGTH,
            nullable: val.IS_NULLABLE === 'YES',
          };
          return columns;
        }, {});
        return (column && out[column]) || out;
      },
    };
  }

}
