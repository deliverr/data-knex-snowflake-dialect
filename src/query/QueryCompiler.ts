// @ts-ignore
import * as QueryCompiler_MySQL from "knex/lib/dialects/mysql/query/mysql-querycompiler";

export class QueryCompiler extends QueryCompiler_MySQL {
  constructor(client: any, builder: any) {
    super(client, builder);
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

}
