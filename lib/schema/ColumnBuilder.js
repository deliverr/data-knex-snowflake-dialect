"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const ColumnBuilder = require("knex/lib/schema/columnbuilder");
class SnowflakeColumnBuilder extends ColumnBuilder {
    constructor(client, tableBuilder, type, args) {
        super(client, tableBuilder, type, args);
    }
    // primary needs to set not null on non-preexisting columns, or fail
    primary() {
        // @ts-ignore
        this.notNullable();
        return super.primary();
    }
    index() {
        // @ts-ignore
        this.client.logger.warn('Snowflake does not support the creation of indexes.');
        return this;
    }
}
exports.SnowflakeColumnBuilder = SnowflakeColumnBuilder;
//# sourceMappingURL=ColumnBuilder.js.map