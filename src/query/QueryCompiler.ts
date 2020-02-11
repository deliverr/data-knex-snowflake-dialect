// @ts-ignore
import * as QueryCompiler_MySQL from "knex/lib/dialects/mysql/query/compiler";

export class QueryCompiler extends QueryCompiler_MySQL {
  constructor(client: any, builder: any) {
    super(client, builder);
  }

  forUpdate() {
    super.client.logger.warn('table lock is not supported by snowflake dialect');
    return '';
  }

  forShare() {
    super.client.logger.warn(
      'lock for share is not supported by snowflake dialect'
    );
    return '';
  }

}
