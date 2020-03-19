"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const ColumnCompiler_MySQL = require("knex/lib/dialects/mysql/schema/compiler");
class ColumnCompiler extends ColumnCompiler_MySQL {
    constructor(client, builder) {
        super(client, builder);
    }
}
exports.ColumnCompiler = ColumnCompiler;
//# sourceMappingURL=ColumnCompiler.js.map