import * as ColumnCompiler_MySQL from "knex/lib/dialects/mysql/schema/compiler";
export declare class ColumnCompiler extends ColumnCompiler_MySQL {
    constructor(client: any, tableBuilder: any, columnBuilder: any);
    increments: 'int unsigned not null auto_increment primary key';
    bigincrements: 'bigint unsigned not null auto_increment primary key';
    bigint(): string;
    double(precision: any, scale: any): string;
    integer(length: any): string;
    mediumint: 'mediumint';
    smallint: 'smallint';
    tinyint(length: any): string;
    text(column: any): "mediumtext" | "longtext" | "text";
    mediumtext(): "mediumtext" | "longtext" | "text";
    longtext(): "mediumtext" | "longtext" | "text";
    enu(allowed: any): string;
    bit(length: any): string;
    binary(length: any): string;
    json(): string;
    jsonb(): string;
    unsigned(): string;
    first(): string;
    collate(collation: any): string;
    _num(val: string, fallback?: number): number | undefined;
}
