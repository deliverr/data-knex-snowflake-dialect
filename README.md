# knex-snowflake-dialect
knex.js dialect for the Snowflake data warehouse.

As of release 0.1.x, only the `connect` and `raw` query methods have been tested.

## Installation

```shell script
npm install knex-snowflake-client
```

## Usage

Sample initialization:

```javascript
import * as knex from "knex";
import { SnowflakeDialect } from "knex-snowflake-dialect";

export const Snowflake = knex({
  client: SnowflakeDialect,
  debug: true,
  connection: "snowflake://myuser:mypassword@myaccount.myregion.snowflakecomputing.com/mydb?warehouse=MY_WAREHOUSE",
  pool: {
    min: 1,
    max: 1
  }
});
```

The configuration could alternatively break out the `connection` parameters as separate keys, per the 
[snowflake-sdk "Establishing a Connection"](https://docs.snowflake.net/manuals/user-guide/nodejs-driver-use.html#establishing-a-connection)
documentation.
