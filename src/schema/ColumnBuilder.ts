// @ts-ignore
import * as ColumnBuilder from "knex/lib/schema/columnbuilder";

export class SnowflakeColumnBuilder extends ColumnBuilder {

  // primary needs to set not null on non-preexisting columns, or fail
  primary() {
    // @ts-ignore
    this.notNullable();
    return super.primary();
  }

  index() {
    // @ts-ignore
    this.client.logger.warn(
      'Snowflake does not support the creation of indexes.'
    );
    return this;
  }
}
