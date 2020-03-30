// @ts-ignore
import * as TableCompiler_MySQL from "knex/lib/dialects/mysql/schema/tablecompiler";
export declare class TableCompiler extends TableCompiler_MySQL {
    constructor(client: any, builder: any);
    index(columns: any, indexName: any, indexType: any): void;
    dropIndex(columns: any, indexName: any): void;
}
