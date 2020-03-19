// @ts-ignore
import * as TableCompiler_MySQL from "knex/lib/dialects/mysql/schema/tablecompiler";

export class TableCompiler extends TableCompiler_MySQL {
  constructor(client: any, builder: any) {
    super(client, builder);
  }
}
