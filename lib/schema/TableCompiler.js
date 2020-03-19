"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const TableCompiler_MySQL = require("knex/lib/dialects/mysql/schema/tablecompiler");
class TableCompiler extends TableCompiler_MySQL {
    constructor(client, builder) {
        super(client, builder);
    }
}
exports.TableCompiler = TableCompiler;
//# sourceMappingURL=TableCompiler.js.map