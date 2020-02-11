import * as Bluebird from "bluebird";
import * as Client from "knex/lib/client";
import { SnowflakeTransaction } from "./Transaction";
import { QueryCompiler } from "./query/QueryCompiler";
import { SnowflakeColumnBuilder } from "./schema/ColumnBuilder";
export declare class SnowflakeDialect extends Client {
    constructor(config?: any);
    get dialect(): string;
    get driverName(): string;
    transaction(): SnowflakeTransaction;
    queryCompiler(): QueryCompiler;
    columnBuilder(): SnowflakeColumnBuilder;
    /** The following will likely be needed, but have not yet been implemented
    columnCompiler() {
      return new ColumnCompiler(this, ...arguments);
    },
  
    tableCompiler() {
      return new TableCompiler(this, ...arguments);
    },
  
    schemaCompiler() {
      return new SchemaCompiler(this, ...arguments);
    },
    **/
    _driver(): any;
    acquireRawConnection(): Bluebird<unknown>;
    destroyRawConnection(connection: any): Promise<unknown>;
    validateConnection(connection: any): boolean;
    _query(connection: any, obj: any): Bluebird<unknown>;
    processResponse(obj: any, runner: any): any;
}
