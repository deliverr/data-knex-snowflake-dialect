// @ts-ignore
import * as ColumnBuilder from "knex/lib/schema/columnbuilder";
export declare class SnowflakeColumnBuilder extends ColumnBuilder {
    constructor(client: any, tableBuilder: any, type: any, args: any);
    primary(): any;
    index(): this;
}
