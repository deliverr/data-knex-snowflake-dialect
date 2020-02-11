// @ts-ignore
import * as ColumnBuilder from "knex/lib/schema/columnbuilder";

export class SnowflakeColumnBuilder extends ColumnBuilder {

  // primary needs to set not null on non-preexisting columns, or fail
  primary() {
    super.notNullable();
    return super.primary();
  }

  index() {
    super.client.logger.warn(
      'Snowflake does not support the creation of indexes.'
    );
    return this;
  }
}
