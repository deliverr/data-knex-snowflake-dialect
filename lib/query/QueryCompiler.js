"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const QueryCompiler_MySQL = require("knex/lib/dialects/mysql/query/compiler");
class QueryCompiler extends QueryCompiler_MySQL {
    constructor(client, builder) {
        super(client, builder);
    }
    forUpdate() {
        // @ts-ignore
        this.client.logger.warn('table lock is not supported by snowflake dialect');
        return '';
    }
    forShare() {
        // @ts-ignore
        this.client.logger.warn('lock for share is not supported by snowflake dialect');
        return '';
    }
}
exports.QueryCompiler = QueryCompiler;
//# sourceMappingURL=QueryCompiler.js.map