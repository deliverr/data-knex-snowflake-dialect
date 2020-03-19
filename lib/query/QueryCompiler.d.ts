// @ts-ignore
import * as QueryCompiler_MySQL from "knex/lib/dialects/mysql/query/compiler";
export declare class QueryCompiler extends QueryCompiler_MySQL {
    constructor(client: any, builder: any);
    forUpdate(): string;
    forShare(): string;
}
