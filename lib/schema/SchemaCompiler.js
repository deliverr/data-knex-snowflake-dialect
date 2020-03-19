"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const SchemaCompiler_MySQL = require("knex/lib/dialects/mysql/schema/compiler");
class SchemaCompiler extends SchemaCompiler_MySQL {
    constructor(client, builder) {
        super(client, builder);
    }
}
exports.SchemaCompiler = SchemaCompiler;
//# sourceMappingURL=SchemaCompiler.js.map