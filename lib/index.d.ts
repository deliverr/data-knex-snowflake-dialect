import * as Bluebird from "bluebird";
import * as Knex from "knex";
import { QueryCompiler } from "./query/QueryCompiler";
import { SchemaCompiler, TableCompiler } from "./schema";
export declare class SnowflakeDialect extends Knex.Client {
    constructor(config?: any);
    get dialect(): string;
    get driverName(): string;
    transaction(container: any, config: any, outerTx: any): Knex.Transaction;
    queryCompiler(builder: any): QueryCompiler;
    columnBuilder(tableBuilder: any, type: any, args: any): any;
    columnCompiler(tableCompiler: any, columnBuilder: any): any;
    tableCompiler(tableBuilder: any): TableCompiler;
    schemaCompiler(builder: any): SchemaCompiler;
    _driver(): any;
    acquireRawConnection(): Bluebird<unknown>;
    destroyRawConnection(connection: any): Promise<void>;
    validateConnection(connection: any): Promise<boolean>;
    _query(connection: any, obj: any): Bluebird<unknown>;
    processResponse(obj: any, runner: any): any;
    customWrapIdentifier(value: any, origImpl: any, queryContext: any): any;
}
