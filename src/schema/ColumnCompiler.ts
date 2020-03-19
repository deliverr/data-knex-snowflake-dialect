// @ts-ignore
import * as ColumnCompiler_MySQL from "knex/lib/dialects/mysql/schema/compiler";

export class ColumnCompiler extends ColumnCompiler_MySQL {
  constructor(client: any, builder: any) {
    super(client, builder);
  }
}
