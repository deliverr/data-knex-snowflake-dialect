"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const TableCompiler_MySQL = require("knex/lib/dialects/mysql/schema/mysql-tablecompiler");
class TableCompiler extends TableCompiler_MySQL {
    constructor(client, builder) {
        super(client, builder);
    }
    index(columns, indexName, indexType) {
        // @ts-ignore
        this.client.logger.warn('Snowflake does not support the creation of indexes.');
    }
    ;
    dropIndex(columns, indexName) {
        // @ts-ignore
        this.client.logger.warn('Snowflake does not support the deletion of indexes.');
    }
    ;
}
exports.TableCompiler = TableCompiler;
//# sourceMappingURL=TableCompiler.js.map