import { SnowflakeDialect } from "../../../src";
import { QueryBuilder } from "knex";
import * as PostgresClient from "knex/lib/dialects/postgres";

// use driverName as key
const clients = {
  "snowflake-sdk": new SnowflakeDialect({ client: SnowflakeDialect }),
  pg: new PostgresClient({ client: "pg" })
};

const useNullAsDefaultConfig = { useNullAsDefault: true };
// use driverName as key
const clientsWithNullAsDefault = {
  "snowflake-sdk": new SnowflakeDialect(
    Object.assign({ client: SnowflakeDialect }, useNullAsDefaultConfig)
  ),
  pg: new PostgresClient({ client: "pg" }, useNullAsDefaultConfig)
};

const customLoggerConfig = {
  log: {
    warn: function(message) {
      throw new Error(message);
    },
  },
};
const clientsWithCustomLoggerForTestWarnings = {
  "snowflake-sdk": new SnowflakeDialect(
    Object.assign({ client: SnowflakeDialect }, customLoggerConfig)
  ),
  pg: new PostgresClient(Object.assign({ client: 'pg' }, customLoggerConfig)),
};

// note: as a workaround, we are using postgres here, since that's using the default " field wrapping
// otherwise subquery cloning would need to be fixed. See: https://github.com/tgriesser/knex/pull/2063
function qb() {
  return clients.pg.queryBuilder();
}

function raw(sql, bindings?) {
  return clients.pg.raw(sql, bindings);
}

function ref(ref) {
  return clients.pg.ref(ref);
}

function verifySqlResult(dialect, expectedObj, sqlObj) {
  Object.keys(expectedObj).forEach((key) => {
    if (typeof expectedObj[key] === 'function') {
      expectedObj[key](sqlObj[key]);
    } else {
      try {
        expect(sqlObj[key]).toEqual(expectedObj[key]);
      } catch (e) {
        e.stack = dialect + ': ' + e.stack;
        throw e;
      }
    }
  });
}

function testsql(chain, valuesToCheck, selectedClients?) {
  selectedClients = selectedClients || clients;
  Object.keys(valuesToCheck).forEach((key) => {
    const newChain = chain.clone();
    newChain.client = selectedClients[key];
    const sqlAndBindings = newChain.toSQL();

    const checkValue = valuesToCheck[key];
    if (typeof checkValue === 'string') {
      verifySqlResult(key, { sql: checkValue }, sqlAndBindings);
    } else {
      verifySqlResult(key, checkValue, sqlAndBindings);
    }
  });
}

function testNativeSql(chain, valuesToCheck, selectedClients?) {
  selectedClients = selectedClients || clients;
  Object.keys(valuesToCheck).forEach((key) => {
    const newChain = chain.clone();
    newChain.client = selectedClients[key];
    const sqlAndBindings = newChain.toSQL().toNative();
    const checkValue = valuesToCheck[key];
    verifySqlResult(key, checkValue, sqlAndBindings);
  });
}

function testquery(chain, valuesToCheck, selectedClients?) {
  selectedClients = selectedClients || clients;
  Object.keys(valuesToCheck).forEach((key) => {
    const newChain = chain.clone();
    newChain.client = selectedClients[key];
    const sqlString = newChain.toQuery();
    const checkValue = valuesToCheck[key];
    expect(checkValue).toEqual(sqlString);
  });
}

describe('Custom identifier wrapping', () => {
  const customWrapperConfig = {
    wrapIdentifier: (value, clientImpl, context) => {
      let suffix = '_wrapper_was_here';
      if (context && context.fancy) {
        suffix = '_fancy_wrapper_was_here';
      }
      return clientImpl(value + suffix);
    },
  };

  // use driverName as key
  const clientsWithCustomIdentifierWrapper = {
    "snowflake-sdk": new SnowflakeDialect(
      Object.assign({ client: SnowflakeDialect }, customWrapperConfig)
    )
  };

  it('should use custom wrapper', () => {
    testsql(
      qb()
        .withSchema('schema')
        .select('users.foo as bar')
        .from('users'),
      {
        mysql:
          'select `users_wrapper_was_here`.`foo_wrapper_was_here` as `bar_wrapper_was_here` from `schema_wrapper_was_here`.`users_wrapper_was_here`',
        mssql:
          'select [users_wrapper_was_here].[foo_wrapper_was_here] as [bar_wrapper_was_here] from [schema_wrapper_was_here].[users_wrapper_was_here]',
        oracledb:
          'select "users_wrapper_was_here"."foo_wrapper_was_here" "bar_wrapper_was_here" from "schema_wrapper_was_here"."users_wrapper_was_here"',
        pg:
          'select "users_wrapper_was_here"."foo_wrapper_was_here" as "bar_wrapper_was_here" from "schema_wrapper_was_here"."users_wrapper_was_here"',
        'pg-redshift':
          'select "users_wrapper_was_here"."foo_wrapper_was_here" as "bar_wrapper_was_here" from "schema_wrapper_was_here"."users_wrapper_was_here"',
        sqlite3:
          'select `users_wrapper_was_here`.`foo_wrapper_was_here` as `bar_wrapper_was_here` from `schema_wrapper_was_here`.`users_wrapper_was_here`',
      },
      clientsWithCustomIdentifierWrapper
    );
  });

  it('should use custom wrapper on multiple inserts with returning', () => {
    // returning only supported directly by postgres and with workaround with oracle
    // other databases implicitly return the inserted id
    testsql(
      qb()
        .from('users')
        .insert(
          [{ email: 'foo', name: 'taylor' }, { email: 'bar', name: 'dayle' }],
          'id'
        ),
      {
        "snowflake-sdk": {
          sql:
            'insert into `users_wrapper_was_here` (`email_wrapper_was_here`, `name_wrapper_was_here`) values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        }
      },
      clientsWithCustomIdentifierWrapper
    );
  });

  it('should use custom wrapper on multiple inserts with multiple returning', () => {
    testsql(
      qb()
        .from('users')
        .insert(
          [{ email: 'foo', name: 'taylor' }, { email: 'bar', name: 'dayle' }],
          ['id', 'name']
        ),
      {
        "snowflake-sdk": {
          sql:
            'insert into `users_wrapper_was_here` (`email_wrapper_was_here`, `name_wrapper_was_here`) values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        }
      },
      clientsWithCustomIdentifierWrapper
    );
  });

  describe('queryContext', () => {
    it('should pass the query context to the custom wrapper', () => {
      testsql(
        qb()
          .withSchema('schema')
          .select('users.foo as bar')
          .from('users')
          .queryContext({ fancy: true }),
        {
          "snowflake-sdk":
            'select `users_fancy_wrapper_was_here`.`foo_fancy_wrapper_was_here` as `bar_fancy_wrapper_was_here` from `schema_fancy_wrapper_was_here`.`users_fancy_wrapper_was_here`'
        },
        clientsWithCustomIdentifierWrapper
      );
    });

    it('should pass the query context for raw queries', () => {
      testsql(
        qb()
          .select(raw('??', [{ a: 'col1' }]).queryContext({ fancy: true }))
          .from('users')
          .queryContext({ fancy: true }),
        {
          "snowflake-sdk":
            'select `col1_fancy_wrapper_was_here` as `a_fancy_wrapper_was_here` from `users_fancy_wrapper_was_here`'
        },
        clientsWithCustomIdentifierWrapper
      );
    });

    it('should allow chaining', () => {
      const builder = qb();
      expect(builder.queryContext({ foo: 'foo' })).toEqual(builder);
    });

    it('should return the query context if called with no arguments', () => {
      expect(
        qb()
          .queryContext({ foo: 'foo' })
          .queryContext()
      ).toEqual({ foo: 'foo' });
    });

    describe('when a builder is cloned', () => {
      it('should copy the query context', () => {
        expect(
          qb()
            .queryContext({ foo: 'foo' })
            .clone()
            .queryContext()
        ).toEqual({ foo: 'foo' });
      });

      it('should not modify the original query context if the clone is modified', () => {
        const original = qb().queryContext({ foo: 'foo' });
        const clone = original.clone().queryContext({ foo: 'bar' });
        expect(original.queryContext()).toEqual({ foo: 'foo' });
        expect(clone.queryContext()).toEqual({ foo: 'bar' });
      });

      it('should only shallow clone the query context', () => {
        const original = qb().queryContext({ foo: { bar: 'baz' } });
        const clone = original.clone();
        clone.queryContext().foo.bar = 'quux';
        expect(original.queryContext()).toEqual({ foo: { bar: 'quux' } });
        expect(clone.queryContext()).toEqual({ foo: { bar: 'quux' } });
      });
    });
  });
});

describe('QueryBuilder', () => {
  it('basic select', () => {
    testsql(
      qb()
        .select('*')
        .from('users'),
      {
        mysql: 'select * from `users`',
        mssql: 'select * from [users]',
        pg: 'select * from "users"',
        'pg-redshift': 'select * from "users"',
      }
    );
  });

  it('adding selects', () => {
    testsql(
      qb()
        .select('foo')
        .select('bar')
        .select(['baz', 'boom'])
        .from('users'),
      {
        mysql: 'select `foo`, `bar`, `baz`, `boom` from `users`',
        mssql: 'select [foo], [bar], [baz], [boom] from [users]',
        pg: 'select "foo", "bar", "baz", "boom" from "users"',
        'pg-redshift': 'select "foo", "bar", "baz", "boom" from "users"',
      }
    );
  });

  it('basic select distinct', () => {
    testsql(
      qb()
        .distinct()
        .select('foo', 'bar')
        .from('users'),
      {
        mysql: {
          sql: 'select distinct `foo`, `bar` from `users`',
        },
        mssql: {
          sql: 'select distinct [foo], [bar] from [users]',
        },
        pg: {
          sql: 'select distinct "foo", "bar" from "users"',
        },
        'pg-redshift': {
          sql: 'select distinct "foo", "bar" from "users"',
        },
      }
    );
  });

  it('basic select with alias as property-value pairs', () => {
    testsql(
      qb()
        .select({ bar: 'foo' })
        .from('users'),
      {
        mysql: 'select `foo` as `bar` from `users`',
        mssql: 'select [foo] as [bar] from [users]',
        oracledb: 'select "foo" "bar" from "users"',
        pg: 'select "foo" as "bar" from "users"',
      }
    );
  });

  it('basic select with mixed pure column and alias pair', () => {
    testsql(
      qb()
        .select('baz', { bar: 'foo' })
        .from('users'),
      {
        mysql: 'select `baz`, `foo` as `bar` from `users`',
        mssql: 'select [baz], [foo] as [bar] from [users]',
        oracledb: 'select "baz", "foo" "bar" from "users"',
        pg: 'select "baz", "foo" as "bar" from "users"',
      }
    );
  });

  it('basic select with array-wrapped alias pair', () => {
    testsql(
      qb()
        .select(['baz', { bar: 'foo' }])
        .from('users'),
      {
        mysql: 'select `baz`, `foo` as `bar` from `users`',
        mssql: 'select [baz], [foo] as [bar] from [users]',
        oracledb: 'select "baz", "foo" "bar" from "users"',
        pg: 'select "baz", "foo" as "bar" from "users"',
      }
    );
  });

  it('basic select with mixed pure column and alias pair', () => {
    testsql(
      qb()
        .select({ bar: 'foo' })
        .from('users'),
      {
        mysql: 'select `foo` as `bar` from `users`',
        mssql: 'select [foo] as [bar] from [users]',
        oracledb: 'select "foo" "bar" from "users"',
        pg: 'select "foo" as "bar" from "users"',
      }
    );
  });

  it('basic old-style alias', () => {
    testsql(
      qb()
        .select('foo as bar')
        .from('users'),
      {
        mysql: 'select `foo` as `bar` from `users`',
        mssql: 'select [foo] as [bar] from [users]',
        oracledb: 'select "foo" "bar" from "users"',
        pg: 'select "foo" as "bar" from "users"',
        'pg-redshift': 'select "foo" as "bar" from "users"',
      }
    );
  });

  it('basic alias trims spaces', () => {
    testsql(
      qb()
        .select(' foo   as bar ')
        .from('users'),
      {
        mysql: 'select `foo` as `bar` from `users`',
        mssql: 'select [foo] as [bar] from [users]',
        oracledb: 'select "foo" "bar" from "users"',
        pg: 'select "foo" as "bar" from "users"',
        'pg-redshift': 'select "foo" as "bar" from "users"',
      }
    );
  });

  it('allows for case-insensitive alias', () => {
    testsql(
      qb()
        .select(' foo   aS bar ')
        .from('users'),
      {
        mysql: 'select `foo` as `bar` from `users`',
        mssql: 'select [foo] as [bar] from [users]',
        oracledb: 'select "foo" "bar" from "users"',
        pg: 'select "foo" as "bar" from "users"',
        'pg-redshift': 'select "foo" as "bar" from "users"',
      }
    );
  });

  it('allows alias with dots in the identifier name', () => {
    testsql(
      qb()
        .select('foo as bar.baz')
        .from('users'),
      {
        mysql: 'select `foo` as `bar.baz` from `users`',
        mssql: 'select [foo] as [bar.baz] from [users]',
        pg: 'select "foo" as "bar.baz" from "users"',
        'pg-redshift': 'select "foo" as "bar.baz" from "users"',
      }
    );
  });

/* todo: fix typesript compile and uncomment
  it('less trivial case of object alias syntax', () => {
    testsql(
      qb()
        .select({
          bar: 'table1.*',
          subq: qb()
            .from('test')
            .select(raw('??', [{ a: 'col1', b: 'col2' }]))
            .limit(1),
        })
        .from({
          table1: 'table',
          table2: 'table',
          subq: qb()
            .from('test')
            .limit(1),
        }),
      {
        "snowflake-sdk":
          'select `table1`.* as `bar`, (select `col1` as `a`, `col2` as `b` from `test` limit ?) as `subq` from `table` as `table1`, `table` as `table2`, (select * from `test` limit ?) as `subq`'
      }
    );
  });
*/
  it('basic table wrapping', () => {
    testsql(
      qb()
        .select('*')
        .from('public.users'),
      {
        mysql: 'select * from `public`.`users`',
        mssql: 'select * from [public].[users]',
        pg: 'select * from "public"."users"',
        'pg-redshift': 'select * from "public"."users"',
      }
    );
  });

  it('basic table wrapping with declared schema', () => {
    testsql(
      qb()
        .withSchema('myschema')
        .select('*')
        .from('users'),
      {
        mysql: 'select * from `myschema`.`users`',
        pg: 'select * from "myschema"."users"',
        'pg-redshift': 'select * from "myschema"."users"',
        mssql: 'select * from [myschema].[users]',
      }
    );
  });

  it('selects from only', () => {
    testsql(
      qb()
        .select('*')
        .from('users', { only: true }),
      {
        pg: 'select * from only "users"',
      }
    );
  });

  it('clear a select', () => {
    testsql(
      qb()
        .select('id', 'email')
        .from('users')
        .clearSelect(),
      {
        mysql: {
          sql: 'select * from `users`',
        },
        mssql: {
          sql: 'select * from [users]',
        },
        pg: {
          sql: 'select * from "users"',
        },
        'pg-redshift': {
          sql: 'select * from "users"',
        },
      }
    );

    testsql(
      qb()
        .select('id')
        .from('users')
        .clearSelect()
        .select('email'),
      {
        mysql: {
          sql: 'select `email` from `users`',
        },
        mssql: {
          sql: 'select [email] from [users]',
        },
        pg: {
          sql: 'select "email" from "users"',
        },
        'pg-redshift': {
          sql: 'select "email" from "users"',
        },
      }
    );
  });

  it('clear a where', () => {
    testsql(
      qb()
        .select('id')
        .from('users')
        .where('id', '=', 1)
        .clearWhere(),
      {
        mysql: {
          sql: 'select `id` from `users`',
        },
        mssql: {
          sql: 'select [id] from [users]',
        },
        pg: {
          sql: 'select "id" from "users"',
        },
        'pg-redshift': {
          sql: 'select "id" from "users"',
        },
      }
    );

    testsql(
      qb()
        .select('id')
        .from('users')
        .where('id', '=', 1)
        .clearWhere()
        .where('id', '=', 2),
      {
        mysql: {
          sql: 'select `id` from `users` where `id` = ?',
          bindings: [2],
        },
        mssql: {
          sql: 'select [id] from [users] where [id] = ?',
          bindings: [2],
        },
        pg: {
          sql: 'select "id" from "users" where "id" = ?',
          bindings: [2],
        },
        'pg-redshift': {
          sql: 'select "id" from "users" where "id" = ?',
          bindings: [2],
        },
      }
    );
  });

  it('clear an order', () => {
    testsql(
      qb()
        .table('users')
        .orderBy('name', 'desc')
        .clearOrder(),
      {
        mysql: {
          sql: 'select * from `users`',
        },
        mssql: {
          sql: 'select * from [users]',
        },
        pg: {
          sql: 'select * from "users"',
        },
        'pg-redshift': {
          sql: 'select * from "users"',
        },
      }
    );

    testsql(
      qb()
        .table('users')
        .orderBy('name', 'desc')
        .clearOrder()
        .orderBy('id', 'asc'),
      {
        mysql: {
          sql: 'select * from `users` order by `id` asc',
        },
        mssql: {
          sql: 'select * from [users] order by [id] asc',
        },
        pg: {
          sql: 'select * from "users" order by "id" asc',
        },
        'pg-redshift': {
          sql: 'select * from "users" order by "id" asc',
        },
      }
    );
  });

  it('clear a having', () => {
    testsql(
      qb()
        .table('users')
        .having('id', '>', 100)
        .clearWhere()
        .having('id', '>', 10),
      {
        mysql: {
          sql: 'select * from `users` having `id` > ?',
          bindings: [10],
        },
        mssql: {
          sql: 'select * from [users] having [id] > ?',
          bindings: [10],
        },
        pg: {
          sql: 'select * from "users" having "id" > ?',
          bindings: [10],
        },
        'pg-redshift': {
          sql: 'select * from "users" having "id" > ?',
          bindings: [10],
        },
      }
    );
  });

  it('basic wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ?',
          bindings: [1],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ?',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "users" where "id" = ?',
          bindings: [1],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ?',
          bindings: [1],
        },
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1),
      {
        mysql: 'select * from `users` where `id` = 1',
        pg: 'select * from "users" where "id" = 1',
        'pg-redshift': 'select * from "users" where "id" = 1',
        mssql: 'select * from [users] where [id] = 1',
      }
    );
  });

  it('whereColumn', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('users.id', '=', 'users.otherId'),
      {
        "snowflake-sdk": 'select * from `users` where `users`.`id` = `users`.`otherId`'
      }
    );
  });

  it('where not', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNot('id', '=', 1),
      {
        "snowflake-sdk": {
          sql: 'select * from `users` where not `id` = ?',
          bindings: [1],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .whereNot('id', '=', 1),
      {
        "snowflake-sdk": 'select * from `users` where not `id` = 1'
      }
    );
  });

  it('grouped or where not', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNot(function() {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": {
          sql: 'select * from `users` where not (`id` = ? or not `id` = ?)',
          bindings: [1, 3],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .whereNot(function() {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": 'select * from `users` where not (`id` = 1 or not `id` = 3)'
      }
    );
  });

  it('grouped or where not alternate', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(function() {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": {
          sql: 'select * from `users` where (`id` = ? or not `id` = ?)',
          bindings: [1, 3],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .where(function() {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": 'select * from `users` where (`id` = 1 or not `id` = 3)'
      }
    );
  });

  it('where not object', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNot({ first_name: 'Test', last_name: 'User' }),
      {
        mysql: {
          sql:
            'select * from `users` where not `first_name` = ? and not `last_name` = ?',
          bindings: ['Test', 'User'],
        },
        "snowflake-sdk": {
          sql:
            'select * from [users] where not [first_name] = ? and not [last_name] = ?',
          bindings: ['Test', 'User'],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .whereNot({ first_name: 'Test', last_name: 'User' }),
      {
        mysql:
          "select * from `users` where not `first_name` = 'Test' and not `last_name` = 'User'",
        pg:
          'select * from "users" where not "first_name" = \'Test\' and not "last_name" = \'User\'',
        'pg-redshift':
          'select * from "users" where not "first_name" = \'Test\' and not "last_name" = \'User\'',
        mssql:
          "select * from [users] where not [first_name] = 'Test' and not [last_name] = 'User'",
      }
    );
  });

  it('where bool', () => {
    testquery(
      qb()
        .select('*')
        .from('users')
        .where(true),
      {
        mysql: 'select * from `users` where 1 = 1',
        sqlite3: 'select * from `users` where 1 = 1',
        mssql: 'select * from [users] where 1 = 1',
        pg: 'select * from "users" where 1 = 1',
      }
    );
  });

  it('where betweens', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereBetween('id', [1, 2]),
      {
        mysql: {
          sql: 'select * from `users` where `id` between ? and ?',
          bindings: [1, 2],
        },
        mssql: {
          sql: 'select * from [users] where [id] between ? and ?',
          bindings: [1, 2],
        },
        pg: {
          sql: 'select * from "users" where "id" between ? and ?',
          bindings: [1, 2],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" between ? and ?',
          bindings: [1, 2],
        },
      }
    );
  });

  it('and where betweens', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', '=', 'user1')
        .andWhereBetween('id', [1, 2]),
      {
        mysql: {
          sql:
            'select * from `users` where `name` = ? and `id` between ? and ?',
          bindings: ['user1', 1, 2],
        },
        mssql: {
          sql:
            'select * from [users] where [name] = ? and [id] between ? and ?',
          bindings: ['user1', 1, 2],
        },
        pg: {
          sql:
            'select * from "users" where "name" = ? and "id" between ? and ?',
          bindings: ['user1', 1, 2],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "name" = ? and "id" between ? and ?',
          bindings: ['user1', 1, 2],
        },
      }
    );
  });

  it('and where not betweens', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', '=', 'user1')
        .andWhereNotBetween('id', [1, 2]),
      {
        mysql: {
          sql:
            'select * from `users` where `name` = ? and `id` not between ? and ?',
          bindings: ['user1', 1, 2],
        },
        mssql: {
          sql:
            'select * from [users] where [name] = ? and [id] not between ? and ?',
          bindings: ['user1', 1, 2],
        },
        pg: {
          sql:
            'select * from "users" where "name" = ? and "id" not between ? and ?',
          bindings: ['user1', 1, 2],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "name" = ? and "id" not between ? and ?',
          bindings: ['user1', 1, 2],
        },
      }
    );
  });

  it('where betweens, alternate', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', 'BeTween', [1, 2]),
      {
        mysql: {
          sql: 'select * from `users` where `id` between ? and ?',
          bindings: [1, 2],
        },
        mssql: {
          sql: 'select * from [users] where [id] between ? and ?',
          bindings: [1, 2],
        },
        pg: {
          sql: 'select * from "users" where "id" between ? and ?',
          bindings: [1, 2],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" between ? and ?',
          bindings: [1, 2],
        },
      }
    );
  });

  it('where not between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotBetween('id', [1, 2]),
      {
        mysql: {
          sql: 'select * from `users` where `id` not between ? and ?',
          bindings: [1, 2],
        },
        mssql: {
          sql: 'select * from [users] where [id] not between ? and ?',
          bindings: [1, 2],
        },
        pg: {
          sql: 'select * from "users" where "id" not between ? and ?',
          bindings: [1, 2],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" not between ? and ?',
          bindings: [1, 2],
        },
      }
    );
  });

  it('where not between, alternate', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', 'not between ', [1, 2]),
      {
        mysql: {
          sql: 'select * from `users` where `id` not between ? and ?',
          bindings: [1, 2],
        },
        mssql: {
          sql: 'select * from [users] where [id] not between ? and ?',
          bindings: [1, 2],
        },
        pg: {
          sql: 'select * from "users" where "id" not between ? and ?',
          bindings: [1, 2],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" not between ? and ?',
          bindings: [1, 2],
        },
      }
    );
  });

  it('basic or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhere('email', '=', 'foo'),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `email` = ?',
          bindings: [1, 'foo'],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [email] = ?',
          bindings: [1, 'foo'],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "email" = ?',
          bindings: [1, 'foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "email" = ?',
          bindings: [1, 'foo'],
        },
      }
    );
  });

  it('chained or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.where('email', '=', 'foo'),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `email` = ?',
          bindings: [1, 'foo'],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [email] = ?',
          bindings: [1, 'foo'],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "email" = ?',
          bindings: [1, 'foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "email" = ?',
          bindings: [1, 'foo'],
        },
      }
    );
  });

  it('raw column wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        // @ts-ignore
        .where(raw('LCASE("name")'), 'foo'),
      {
        mysql: {
          sql: 'select * from `users` where LCASE("name") = ?',
          bindings: ['foo'],
        },
        mssql: {
          sql: 'select * from [users] where LCASE("name") = ?',
          bindings: ['foo'],
        },
        pg: {
          sql: 'select * from "users" where LCASE("name") = ?',
          bindings: ['foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where LCASE("name") = ?',
          bindings: ['foo'],
        },
      }
    );
  });

  it('raw wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('id = ? or email = ?', [1, 'foo'])),
      {
        mysql: {
          sql: 'select * from `users` where id = ? or email = ?',
          bindings: [1, 'foo'],
        },
        mssql: {
          sql: 'select * from [users] where id = ? or email = ?',
          bindings: [1, 'foo'],
        },
        pg: {
          sql: 'select * from "users" where id = ? or email = ?',
          bindings: [1, 'foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where id = ? or email = ?',
          bindings: [1, 'foo'],
        },
      }
    );
  });

  it('raw or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhere(raw('email = ?', ['foo'])),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or email = ?',
          bindings: [1, 'foo'],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or email = ?',
          bindings: [1, 'foo'],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or email = ?',
          bindings: [1, 'foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or email = ?',
          bindings: [1, 'foo'],
        },
      }
    );
  });

  it('chained raw or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.where(raw('email = ?', ['foo'])),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or email = ?',
          bindings: [1, 'foo'],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or email = ?',
          bindings: [1, 'foo'],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or email = ?',
          bindings: [1, 'foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or email = ?',
          bindings: [1, 'foo'],
        },
      }
    );
  });

  it('basic where ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('id', [1, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
      }
    );
  });

  it('multi column where ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn(['a', 'b'], [[1, 2], [3, 4], [5, 6]]),
      {
        mysql: {
          sql:
            'select * from `users` where (`a`, `b`) in ((?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        },
        pg: {
          sql:
            'select * from "users" where ("a", "b") in ((?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where ("a", "b") in ((?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        },
        mssql: {
          sql:
            'select * from [users] where ([a], [b]) in ((?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        },
        oracledb: {
          sql:
            'select * from "users" where ("a", "b") in ((?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        },
        sqlite3: {
          sql:
            'select * from `users` where (`a`, `b`) in ( values (?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        },
      }
    );
  });

  it('orWhereIn', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhereIn('id', [1, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `id` in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [id] in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "id" in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "id" in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
      }
    );
  });

  it('basic where not ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotIn('id', [1, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
      }
    );
  });

  it('chained or where not in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.not.whereIn('id', [1, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `id` not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [id] not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "id" not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "id" not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
      }
    );
  });

  it('or.whereIn', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.whereIn('id', [4, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `id` in (?, ?, ?)',
          bindings: [1, 4, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [id] in (?, ?, ?)',
          bindings: [1, 4, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "id" in (?, ?, ?)',
          bindings: [1, 4, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "id" in (?, ?, ?)',
          bindings: [1, 4, 2, 3],
        },
      }
    );
  });

  it('chained basic where not ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .not.whereIn('id', [1, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" not in (?, ?, ?)',
          bindings: [1, 2, 3],
        },
      }
    );
  });

  it('chained or where not in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.not.whereIn('id', [1, 2, 3]),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `id` not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [id] not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "id" not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "id" not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        },
      }
    );
  });

  it('whereIn with empty array, #477', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('id', []),
      {
        mysql: {
          sql: 'select * from `users` where 1 = ?',
          bindings: [0],
        },
        sqlite3: {
          sql: 'select * from `users` where 1 = ?',
          bindings: [0],
        },
        mssql: {
          sql: 'select * from [users] where 1 = ?',
          bindings: [0],
        },
        pg: {
          sql: 'select * from "users" where 1 = ?',
          bindings: [0],
        },
        'pg-redshift': {
          sql: 'select * from "users" where 1 = ?',
          bindings: [0],
        },
      }
    );
  });

  it('whereNotIn with empty array, #477', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotIn('id', []),
      {
        mysql: {
          sql: 'select * from `users` where 1 = ?',
          bindings: [1],
        },
        sqlite3: {
          sql: 'select * from `users` where 1 = ?',
          bindings: [1],
        },
        mssql: {
          sql: 'select * from [users] where 1 = ?',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "users" where 1 = ?',
          bindings: [1],
        },
        'pg-redshift': {
          sql: 'select * from "users" where 1 = ?',
          bindings: [1],
        },
      }
    );
  });

  it('should allow a function as the first argument, for a grouped where clause', () => {
    const partial = qb()
      .table('test')
      .where('id', '=', 1);
    testsql(partial, {
      mysql: 'select * from `test` where `id` = ?',
      mssql: 'select * from [test] where [id] = ?',
      pg: 'select * from "test" where "id" = ?',
    });

    const subWhere = function(sql) {
      // @ts-ignore
      expect(this).toEqual(sql);
      // @ts-ignore
      this.where({ id: 3 }).orWhere('id', 4);
    };

    testsql(partial.where(subWhere), {
      mysql: {
        sql: 'select * from `test` where `id` = ? and (`id` = ? or `id` = ?)',
        bindings: [1, 3, 4],
      },
      mssql: {
        sql: 'select * from [test] where [id] = ? and ([id] = ? or [id] = ?)',
        bindings: [1, 3, 4],
      },
      pg: {
        sql: 'select * from "test" where "id" = ? and ("id" = ? or "id" = ?)',
        bindings: [1, 3, 4],
      },
      'pg-redshift': {
        sql: 'select * from "test" where "id" = ? and ("id" = ? or "id" = ?)',
        bindings: [1, 3, 4],
      },
    });
  });

  it('should accept a function as the "value", for a sub select', () => {
    const chain = qb().where('id', '=', function(qb) {
      // @ts-ignore
      expect(this).toEqual(qb);
      // @ts-ignore
      this.select('account_id')
        .from('names')
        .where('names.id', '>', 1)
        .orWhere(function() {
          // @ts-ignore
          this.where('names.first_name', 'like', 'Tim%').andWhere(
            'names.id',
            '>',
            10
          );
        });
    });

    testsql(chain, {
      mysql: {
        sql:
          'select * where `id` = (select `account_id` from `names` where `names`.`id` > ? or (`names`.`first_name` like ? and `names`.`id` > ?))',
        bindings: [1, 'Tim%', 10],
      },
      mssql: {
        sql:
          'select * where [id] = (select [account_id] from [names] where [names].[id] > ? or ([names].[first_name] like ? and [names].[id] > ?))',
        bindings: [1, 'Tim%', 10],
      },
      pg: {
        sql:
          'select * where "id" = (select "account_id" from "names" where "names"."id" > ? or ("names"."first_name" like ? and "names"."id" > ?))',
        bindings: [1, 'Tim%', 10],
      },
      'pg-redshift': {
        sql:
          'select * where "id" = (select "account_id" from "names" where "names"."id" > ? or ("names"."first_name" like ? and "names"."id" > ?))',
        bindings: [1, 'Tim%', 10],
      },
    });

    testquery(chain, {
      mysql:
        "select * where `id` = (select `account_id` from `names` where `names`.`id` > 1 or (`names`.`first_name` like 'Tim%' and `names`.`id` > 10))",
      pg:
        'select * where "id" = (select "account_id" from "names" where "names"."id" > 1 or ("names"."first_name" like \'Tim%\' and "names"."id" > 10))',
      'pg-redshift':
        'select * where "id" = (select "account_id" from "names" where "names"."id" > 1 or ("names"."first_name" like \'Tim%\' and "names"."id" > 10))',
      mssql:
        "select * where [id] = (select [account_id] from [names] where [names].[id] > 1 or ([names].[first_name] like 'Tim%' and [names].[id] > 10))",
    });
  });

  it('should accept a function as the "value", for a sub select when chained', () => {
    const chain = qb().where('id', '=', function(qb) {
      // @ts-ignore
      expect(this).toEqual(qb);
      // @ts-ignore
      this.select('account_id')
        .from('names')
        .where('names.id', '>', 1)
        .or.where(function() {
          // @ts-ignore
          this.where('names.first_name', 'like', 'Tim%').and.where(
            'names.id',
            '>',
            10
          );
        });
    });

    testsql(chain, {
      mysql: {
        sql:
          'select * where `id` = (select `account_id` from `names` where `names`.`id` > ? or (`names`.`first_name` like ? and `names`.`id` > ?))',
        bindings: [1, 'Tim%', 10],
      },
      mssql: {
        sql:
          'select * where [id] = (select [account_id] from [names] where [names].[id] > ? or ([names].[first_name] like ? and [names].[id] > ?))',
        bindings: [1, 'Tim%', 10],
      },
      pg: {
        sql:
          'select * where "id" = (select "account_id" from "names" where "names"."id" > ? or ("names"."first_name" like ? and "names"."id" > ?))',
        bindings: [1, 'Tim%', 10],
      },
      'pg-redshift': {
        sql:
          'select * where "id" = (select "account_id" from "names" where "names"."id" > ? or ("names"."first_name" like ? and "names"."id" > ?))',
        bindings: [1, 'Tim%', 10],
      },
    });
  });

  it('should not do whereNull on where("foo", "<>", null) #76', () => {
    testquery(qb().where('foo', '<>', null), {
      mysql: 'select * where `foo` <> NULL',
      mssql: 'select * where [foo] <> NULL',
      pg: 'select * where "foo" <> NULL',
    });
  });

  it('should expand where("foo", "!=") to - where id = "!="', () => {
    testquery(qb().where('foo', '!='), {
      mysql: "select * where `foo` = '!='",
      mssql: "select * where [foo] = '!='",
      pg: 'select * where "foo" = \'!=\'',
    });
  });

  it('unions', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .union(function() {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 2);
      });
    testsql(chain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .union(
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        }
      );
    testsql(multipleArgumentsChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .union([
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        },
      ]);
    testsql(arrayChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });
  });

  it('wraps unions', () => {
    const wrappedChain = qb()
      .select('*')
      .from('users')
      // @ts-ignore
      .where('id', 'in', () => {
        // @ts-ignore
        this.table('users')
          .max('id')
          .union(() => {
            // @ts-ignore
            this.table('users').min('id');
          }, true);
      });
    testsql(wrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from `users` where `id` in (select max(`id`) from `users` union (select min(`id`) from `users`))',
        bindings: [],
      }
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    const multipleArgumentsWrappedChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .union(
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        },
        // @ts-ignore
        true
      );
    testsql(multipleArgumentsWrappedChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union (select * from `users` where `id` = ?) union (select * from `users` where `id` = ?)',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union (select * from [users] where [id] = ?) union (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union (select * from "users" where "id" = ?) union (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union (select * from "users" where "id" = ?) union (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
    });

    const arrayWrappedChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .union(
        [
          function() {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({ id: 2 });
          },
          function() {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({ id: 3 });
          },
        ],
        true
      );
    testsql(arrayWrappedChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union (select * from `users` where `id` = ?) union (select * from `users` where `id` = ?)',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union (select * from [users] where [id] = ?) union (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union (select * from "users" where "id" = ?) union (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union (select * from "users" where "id" = ?) union (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
    });
  });

  it('wraps union alls', () => {
    const wrappedChain = qb()
      .select('*')
      .from('users')
      // @ts-ignore
      .where('id', 'in', function() {
        // @ts-ignore
        this.table('users')
          .max('id')
          .unionAll(function() {
            // @ts-ignore
            this.table('users').min('id');
          }, true);
      });
    testsql(wrappedChain, {
      mysql: {
        sql:
          'select * from `users` where `id` in (select max(`id`) from `users` union all (select min(`id`) from `users`))',
        bindings: [],
      },
      mssql: {
        sql:
          'select * from [users] where [id] in (select max([id]) from [users] union all (select min([id]) from [users]))',
        bindings: [],
      },
      pg: {
        sql:
          'select * from "users" where "id" in (select max("id") from "users" union all (select min("id") from "users"))',
        bindings: [],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" in (select max("id") from "users" union all (select min("id") from "users"))',
        bindings: [],
      },
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    const multipleArgumentsWrappedChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .unionAll(
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        },
        // @ts-ignore
        true
      );
    testsql(multipleArgumentsWrappedChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all (select * from `users` where `id` = ?) union all (select * from `users` where `id` = ?)',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all (select * from [users] where [id] = ?) union all (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all (select * from "users" where "id" = ?) union all (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all (select * from "users" where "id" = ?) union all (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
    });

    const arrayWrappedChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .unionAll(
        [
          function() {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({ id: 2 });
          },
          function() {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({ id: 3 });
          },
        ],
        true
      );
    testsql(arrayWrappedChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all (select * from `users` where `id` = ?) union all (select * from `users` where `id` = ?)',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all (select * from [users] where [id] = ?) union all (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all (select * from "users" where "id" = ?) union all (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all (select * from "users" where "id" = ?) union all (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
    });
  });

  // it("handles grouped mysql unions", function() {
  //   chain = myqb().union(
  //     raw(myqb().select('*').from('users').where('id', '=', 1)).wrap('(', ')'),
  //     raw(myqb().select('*').from('users').where('id', '=', 2)).wrap('(', ')')
  //   ).orderBy('id').limit(10).toSQL();
  //   expect(chain.sql).toEqual('(select * from `users` where `id` = ?) union (select * from `users` where `id` = ?) order by `id` asc limit ?');
  //   expect(chain.bindings).to.eql([1, 2, 10]);
  // });

  it('union alls', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .unionAll(function() {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 2);
      });
    testsql(chain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all select * from `users` where `id` = ?',
        bindings: [1, 2],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all select * from [users] where [id] = ?',
        bindings: [1, 2],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .unionAll(
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        }
      );
    testsql(multipleArgumentsChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all select * from `users` where `id` = ? union all select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all select * from [users] where [id] = ? union all select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .unionAll([
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        },
      ]);
    testsql(arrayChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all select * from `users` where `id` = ? union all select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all select * from [users] where [id] = ? union all select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });
  });

  it('multiple unions', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .union(
        qb()
          .select('*')
          .from('users')
          .where('id', '=', 2)
      )
      .union(function() {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 3);
      });
    testsql(chain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .union([
        qb()
          .select('*')
          .from('users')
          .where({ id: 2 }),
        raw('select * from users where id = ?', [3]),
      ]);
    testsql(arrayChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .union(
        qb()
          .select('*')
          .from('users')
          .where({ id: 2 }),
        raw('select * from users where id = ?', [3])
      );
    testsql(multipleArgumentsChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      },
    });
  });

  it('multiple union alls', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .unionAll(
        qb()
          .select('*')
          .from('users')
          .where('id', '=', 2)
      )
      .unionAll(
        qb()
          .select('*')
          .from('users')
          .where('id', '=', 3)
      );

    testsql(chain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all select * from `users` where `id` = ? union all select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all select * from [users] where [id] = ? union all select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .unionAll([
        qb()
          .select('*')
          .from('users')
          .where({ id: 2 }),
        raw('select * from users where id = ?', [3]),
      ]);
    testsql(arrayChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all select * from `users` where `id` = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all select * from [users] where [id] = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .unionAll(
        qb()
          .select('*')
          .from('users')
          .where({ id: 2 }),
        raw('select * from users where id = ?', [3])
      );
    testsql(multipleArgumentsChain, {
      mysql: {
        sql:
          'select * from `users` where `id` = ? union all select * from `users` where `id` = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      mssql: {
        sql:
          'select * from [users] where [id] = ? union all select * from [users] where [id] = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      },
    });
  });

  it('intersects', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .intersect(function() {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 2);
      });

    testsql(chain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect select * from [users] where [id] = ?',
        bindings: [1, 2],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
      oracledb: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2],
      },
      sqlite3: {
        sql:
          'select * from `users` where `id` = ? intersect select * from `users` where `id` = ?',
        bindings: [1, 2],
      },
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .intersect(
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        }
      );
    testsql(multipleArgumentsChain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect select * from [users] where [id] = ? intersect select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      oracledb: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      sqlite3: {
        sql:
          'select * from `users` where `id` = ? intersect select * from `users` where `id` = ? intersect select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .intersect([
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        },
      ]);
    testsql(arrayChain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect select * from [users] where [id] = ? intersect select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      oracledb: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      sqlite3: {
        sql:
          'select * from `users` where `id` = ? intersect select * from `users` where `id` = ? intersect select * from `users` where `id` = ?',
        bindings: [1, 2, 3],
      },
    });
  });

  it('wraps intersects', () => {
    // @ts-ignore
    const wrappedChain = qb()
      .select('*')
      .from('users')
      // @ts-ignore
      .where('id', 'in', function() {
        // @ts-ignore
        this.table('users')
          .max('id')
          .intersect(function() {
            // @ts-ignore
            this.table('users').min('id');
          }, true);
      });
    testsql(wrappedChain, {
      mssql: {
        sql:
          'select * from [users] where [id] in (select max([id]) from [users] intersect (select min([id]) from [users]))',
        bindings: [],
      },
      pg: {
        sql:
          'select * from "users" where "id" in (select max("id") from "users" intersect (select min("id") from "users"))',
        bindings: [],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" in (select max("id") from "users" intersect (select min("id") from "users"))',
        bindings: [],
      },
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    const multipleArgumentsWrappedChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .intersect(
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 2 });
        },
        function() {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({ id: 3 });
        },
        // @ts-ignore
        true
      );
    testsql(multipleArgumentsWrappedChain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect (select * from [users] where [id] = ?) intersect (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect (select * from "users" where "id" = ?) intersect (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect (select * from "users" where "id" = ?) intersect (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
    });

    const arrayWrappedChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .intersect(
        [
          function() {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({ id: 2 });
          },
          function() {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({ id: 3 });
          },
        ],
        true
      );
    testsql(arrayWrappedChain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect (select * from [users] where [id] = ?) intersect (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect (select * from "users" where "id" = ?) intersect (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect (select * from "users" where "id" = ?) intersect (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3],
      },
    });
  });

  it('multiple intersects', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .intersect(
        qb()
          .select('*')
          .from('users')
          .where('id', '=', 2)
      )
      .intersect(function() {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 3);
      });
    testsql(chain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect select * from [users] where [id] = ? intersect select * from [users] where [id] = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from "users" where "id" = ?',
        bindings: [1, 2, 3],
      },
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .intersect([
        qb()
          .select('*')
          .from('users')
          .where({ id: 2 }),
        raw('select * from users where id = ?', [3]),
      ]);
    testsql(arrayChain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect select * from [users] where [id] = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      },
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({ id: 1 })
      .intersect(
        qb()
          .select('*')
          .from('users')
          .where({ id: 2 }),
        raw('select * from users where id = ?', [3])
      );
    testsql(multipleArgumentsChain, {
      mssql: {
        sql:
          'select * from [users] where [id] = ? intersect select * from [users] where [id] = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      pg: {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      },
      'pg-redshift': {
        sql:
          'select * from "users" where "id" = ? intersect select * from "users" where "id" = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      },
    });
  });

  it('sub select where ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('id', (qb) => {
          qb.select('id')
            .from('users')
            .where('age', '>', 25)
            .limit(3);
        }),
      {
        mysql: {
          sql:
            'select * from `users` where `id` in (select `id` from `users` where `age` > ? limit ?)',
          bindings: [25, 3],
        },
        mssql: {
          sql:
            'select * from [users] where [id] in (select top (?) [id] from [users] where [age] > ?)',
          bindings: [3, 25],
        },
        oracledb: {
          sql:
            'select * from "users" where "id" in (select * from (select "id" from "users" where "age" > ?) where rownum <= ?)',
          bindings: [25, 3],
        },
        pg: {
          sql:
            'select * from "users" where "id" in (select "id" from "users" where "age" > ? limit ?)',
          bindings: [25, 3],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "id" in (select "id" from "users" where "age" > ? limit ?)',
          bindings: [25, 3],
        },
      }
    );
  });

  it('sub select multi column where ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn(['id_a', 'id_b'], (qb) => {
          qb.select('id_a', 'id_b')
            .from('users')
            .where('age', '>', 25)
            .limit(3);
        }),
      {
        mysql: {
          sql:
            'select * from `users` where (`id_a`, `id_b`) in (select `id_a`, `id_b` from `users` where `age` > ? limit ?)',
          bindings: [25, 3],
        },
        oracledb: {
          sql:
            'select * from "users" where ("id_a", "id_b") in (select * from (select "id_a", "id_b" from "users" where "age" > ?) where rownum <= ?)',
          bindings: [25, 3],
        },
        pg: {
          sql:
            'select * from "users" where ("id_a", "id_b") in (select "id_a", "id_b" from "users" where "age" > ? limit ?)',
          bindings: [25, 3],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where ("id_a", "id_b") in (select "id_a", "id_b" from "users" where "age" > ? limit ?)',
          bindings: [25, 3],
        },
        mssql: {
          sql:
            'select * from [users] where ([id_a], [id_b]) in (select top (?) [id_a], [id_b] from [users] where [age] > ?)',
          bindings: [3, 25],
        },
      }
    );
  });

  it('sub select where not ins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotIn('id', (qb) => {
          qb.select('id')
            .from('users')
            .where('age', '>', 25);
        }),
      {
        mysql: {
          sql:
            'select * from `users` where `id` not in (select `id` from `users` where `age` > ?)',
          bindings: [25],
        },
        mssql: {
          sql:
            'select * from [users] where [id] not in (select [id] from [users] where [age] > ?)',
          bindings: [25],
        },
        pg: {
          sql:
            'select * from "users" where "id" not in (select "id" from "users" where "age" > ?)',
          bindings: [25],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "id" not in (select "id" from "users" where "age" > ?)',
          bindings: [25],
        },
      }
    );
  });

  it('basic where nulls', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNull('id'),
      {
        mysql: {
          sql: 'select * from `users` where `id` is null',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] where [id] is null',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" where "id" is null',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" is null',
          bindings: [],
        },
      }
    );
  });

  it('basic or where nulls', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhereNull('id'),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `id` is null',
          bindings: [1],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [id] is null',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "id" is null',
          bindings: [1],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "id" is null',
          bindings: [1],
        },
      }
    );
  });

  it('basic where not nulls', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotNull('id'),
      {
        mysql: {
          sql: 'select * from `users` where `id` is not null',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] where [id] is not null',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" where "id" is not null',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" is not null',
          bindings: [],
        },
      }
    );
  });

  it('basic or where not nulls', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '>', 1)
        .orWhereNotNull('id'),
      {
        mysql: {
          sql: 'select * from `users` where `id` > ? or `id` is not null',
          bindings: [1],
        },
        mssql: {
          sql: 'select * from [users] where [id] > ? or [id] is not null',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "users" where "id" > ? or "id" is not null',
          bindings: [1],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" > ? or "id" is not null',
          bindings: [1],
        },
      }
    );
  });

  it('group bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .groupBy('id', 'email'),
      {
        mysql: {
          sql: 'select * from `users` group by `id`, `email`',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] group by [id], [email]',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" group by "id", "email"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" group by "id", "email"',
          bindings: [],
        },
      }
    );
  });

  it('order bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy('email')
        .orderBy('age', 'desc'),
      {
        mysql: {
          sql: 'select * from `users` order by `email` asc, `age` desc',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by [email] asc, [age] desc',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
      }
    );
  });

  it('order by array', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy(['email', { column: 'age', order: 'desc' }]),
      {
        mysql: {
          sql: 'select * from `users` order by `email` asc, `age` desc',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by [email] asc, [age] desc',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
      }
    );
  });

  it('order by array without order', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy([{ column: 'email' }, { column: 'age', order: 'desc' }]),
      {
        mysql: {
          sql: 'select * from `users` order by `email` asc, `age` desc',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by [email] asc, [age] desc',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
      }
    );
  });

  it('order by accepts query builder', () => {
    testsql(
      qb()
        .select()
        .from('persons')
        .orderBy(
          qb()
            .select()
            .from('persons as p')
            .where('persons.id', 'p.id')
            .select('p.id')
        ),
      {
        mysql: {
          sql:
            'select * from `persons` order by (select `p`.`id` from `persons` as `p` where `persons`.`id` = `p`.`id`) asc',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [persons] order by (select [p].[id] from [persons] as [p] where [persons].[id] = [p].[id]) asc',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "persons" order by (select "p"."id" from "persons" as "p" where "persons"."id" = "p"."id") asc',
          bindings: [],
        },
        sqlite3: {
          sql:
            'select * from `persons` order by (select `p`.`id` from `persons` as `p` where `persons`.`id` = `p`.`id`) asc',
          bindings: [],
        },
      }
    );
  });

  it('raw group bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .groupByRaw('id, email'),
      {
        mysql: {
          sql: 'select * from `users` group by id, email',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] group by id, email',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" group by id, email',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" group by id, email',
          bindings: [],
        },
      }
    );
  });

  it('raw order bys with default direction', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy(raw('col NULLS LAST')),
      {
        mysql: {
          sql: 'select * from `users` order by col NULLS LAST asc',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by col NULLS LAST asc',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by col NULLS LAST asc',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by col NULLS LAST asc',
          bindings: [],
        },
      }
    );
  });

  it('raw order bys with specified direction', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy(raw('col NULLS LAST'), 'desc'),
      {
        mysql: {
          sql: 'select * from `users` order by col NULLS LAST desc',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by col NULLS LAST desc',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by col NULLS LAST desc',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by col NULLS LAST desc',
          bindings: [],
        },
      }
    );
  });

  it('orderByRaw', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderByRaw('col NULLS LAST DESC'),
      {
        mysql: {
          sql: 'select * from `users` order by col NULLS LAST DESC',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by col NULLS LAST DESC',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by col NULLS LAST DESC',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by col NULLS LAST DESC',
          bindings: [],
        },
      }
    );
  });

  it('orderByRaw second argument is the binding', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderByRaw('col NULLS LAST ?', 'dEsc'),
      {
        mysql: {
          sql: 'select * from `users` order by col NULLS LAST ?',
          bindings: ['dEsc'],
        },
        mssql: {
          sql: 'select * from [users] order by col NULLS LAST ?',
          bindings: ['dEsc'],
        },
        pg: {
          sql: 'select * from "users" order by col NULLS LAST ?',
          bindings: ['dEsc'],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by col NULLS LAST ?',
          bindings: ['dEsc'],
        },
      }
    );
  });

  it('multiple order bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy('email')
        .orderBy('age', 'desc'),
      {
        mysql: {
          sql: 'select * from `users` order by `email` asc, `age` desc',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [users] order by [email] asc, [age] desc',
          bindings: [],
        },
        pg: {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "users" order by "email" asc, "age" desc',
          bindings: [],
        },
      }
    );
  });

  it('havings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having('email', '>', 1),
      {
        mysql: 'select * from `users` having `email` > ?',
        mssql: 'select * from [users] having [email] > ?',
        pg: 'select * from "users" having "email" > ?',
        'pg-redshift': 'select * from "users" having "email" > ?',
        oracledb: 'select * from "users" having "email" > ?',
      }
    );
  });

  it('or having', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having('baz', '>', 5)
        .orWhere('email', '=', 10),
      {
        mysql: 'select * from `users` having `baz` > ? or `email` = ?',
        mssql: 'select * from [users] having [baz] > ? or [email] = ?',
        pg: 'select * from "users" having "baz" > ? or "email" = ?',
        'pg-redshift': 'select * from "users" having "baz" > ? or "email" = ?',
        oracledb: 'select * from "users" having "baz" > ? or "email" = ?',
      }
    );
  });

  it('nested having', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having(function() {
          // @ts-ignore
          this.where('email', '>', 1);
        }),
      {
        mysql: 'select * from `users` having (`email` > ?)',
        mssql: 'select * from [users] having ([email] > ?)',
        pg: 'select * from "users" having ("email" > ?)',
        'pg-redshift': 'select * from "users" having ("email" > ?)',
        oracledb: 'select * from "users" having ("email" > ?)',
      }
    );
  });

  it('nested or havings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having(function() {
          // @ts-ignore
          this.where('email', '>', 10);
          // @ts-ignore
          this.orWhere('email', '=', 7);
        }),
      {
        mysql: 'select * from `users` having (`email` > ? or `email` = ?)',
        mssql: 'select * from [users] having ([email] > ? or [email] = ?)',
        pg: 'select * from "users" having ("email" > ? or "email" = ?)',
        'pg-redshift':
          'select * from "users" having ("email" > ? or "email" = ?)',
        oracledb: 'select * from "users" having ("email" > ? or "email" = ?)',
      }
    );
  });

  it('grouped having', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .groupBy('email')
        .having('email', '>', 1),
      {
        mysql: 'select * from `users` group by `email` having `email` > ?',
        mssql: 'select * from [users] group by [email] having [email] > ?',
        pg: 'select * from "users" group by "email" having "email" > ?',
        'pg-redshift':
          'select * from "users" group by "email" having "email" > ?',
        oracledb: 'select * from "users" group by "email" having "email" > ?',
      }
    );
  });

  it('having from', () => {
    testsql(
      qb()
        .select('email as foo_email')
        .from('users')
        .having('foo_email', '>', 1),
      {
        mysql:
          'select `email` as `foo_email` from `users` having `foo_email` > ?',
        mssql:
          'select [email] as [foo_email] from [users] having [foo_email] > ?',
        oracledb:
          'select "email" "foo_email" from "users" having "foo_email" > ?',
        pg: 'select "email" as "foo_email" from "users" having "foo_email" > ?',
      }
    );
  });

  it('raw havings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having(raw('user_foo < user_bar')),
      {
        mysql: 'select * from `users` having user_foo < user_bar',
        mssql: 'select * from [users] having user_foo < user_bar',
        pg: 'select * from "users" having user_foo < user_bar',
        'pg-redshift': 'select * from "users" having user_foo < user_bar',
        oracledb: 'select * from "users" having user_foo < user_bar',
      }
    );
  });

  it('raw or havings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having('baz', '=', 1)
        .orWhere(raw('user_foo < user_bar')),
      {
        mysql: 'select * from `users` having `baz` = ? or user_foo < user_bar',
        mssql: 'select * from [users] having [baz] = ? or user_foo < user_bar',
        pg: 'select * from "users" having "baz" = ? or user_foo < user_bar',
        'pg-redshift':
          'select * from "users" having "baz" = ? or user_foo < user_bar',
        oracledb:
          'select * from "users" having "baz" = ? or user_foo < user_bar',
      }
    );
  });

  it('having null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNull('baz'),
      {
        "snowflake-sdk": 'select * from `users` having `baz` is null'
      }
    );
  });

  it('or having null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNull('baz')
        .orWhereNull('foo'),
      {
        mysql: 'select * from `users` having `baz` is null or `foo` is null',
        mssql: 'select * from [users] having [baz] is null or [foo] is null',
        pg: 'select * from "users" having "baz" is null or "foo" is null',
        'pg-redshift':
          'select * from "users" having "baz" is null or "foo" is null',
        oracledb: 'select * from "users" having "baz" is null or "foo" is null',
      }
    );
  });

  it('having not null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotNull('baz'),
      {
        mysql: 'select * from `users` having `baz` is not null',
        mssql: 'select * from [users] having [baz] is not null',
        pg: 'select * from "users" having "baz" is not null',
        'pg-redshift': 'select * from "users" having "baz" is not null',
        oracledb: 'select * from "users" having "baz" is not null',
      }
    );
  });

  it('or having not null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotNull('baz')
        .orWhereNotNull('foo'),
      {
        mysql:
          'select * from `users` having `baz` is not null or `foo` is not null',
        mssql:
          'select * from [users] having [baz] is not null or [foo] is not null',
        pg:
          'select * from "users" having "baz" is not null or "foo" is not null',
        'pg-redshift':
          'select * from "users" having "baz" is not null or "foo" is not null',
        oracledb:
          'select * from "users" having "baz" is not null or "foo" is not null',
      }
    );
  });

  it('having exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereExists(function() {
          // @ts-ignore
          this.select('baz').from('users');
        }),
      {
        "snowflake-sdk":
          'select * from `users` having exists (select `baz` from `users`)'
      }
    );
  });

  it('or having exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereExists(function() {
          //@ts-ignore
          this.select('baz').from('users');
        })
        .orWhereExists(function() {
          // @ts-ignore
          this.select('foo').from('users');
        }),
      {
        "snowflake-sdk":
          'select * from `users` having exists (select `baz` from `users`) or exists (select `foo` from `users`)'
      }
    );
  });

  it('where not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotExists(function() {
          // @ts-ignore
          this.select('baz').from('users');
        }),
      {
        mysql:
          'select * from `users` where not exists (select `baz` from `users`)',
        mssql:
          'select * from [users] where not exists (select [baz] from [users])',
        pg:
          'select * from "users" where not exists (select "baz" from "users")',
        'pg-redshift':
          'select * from "users" where not exists (select "baz" from "users")',
        oracledb:
          'select * from "users" where not exists (select "baz" from "users")',
      }
    );
  });

  it('or where not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotExists(function() {
          // @ts-ignore
          this.select('baz').from('users');
        })
        .orWhereNotExists(function() {
          // @ts-ignore
          this.select('foo').from('users');
        }),
      {
        mysql:
          'select * from `users` where not exists (select `baz` from `users`) or not exists (select `foo` from `users`)',
        mssql:
          'select * from [users] where not exists (select [baz] from [users]) or not exists (select [foo] from [users])',
        pg:
          'select * from "users" where not exists (select "baz" from "users") or not exists (select "foo" from "users")',
        'pg-redshift':
          'select * from "users" where not exists (select "baz" from "users") or not exists (select "foo" from "users")',
        oracledb:
          'select * from "users" where not exists (select "baz" from "users") or not exists (select "foo" from "users")',
      }
    );
  });

  it('where between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereBetween('baz', [5, 10]),
      {
        mysql: 'select * from `users` where `baz` between ? and ?',
        mssql: 'select * from [users] where [baz] between ? and ?',
        pg: 'select * from "users" where "baz" between ? and ?',
        'pg-redshift': 'select * from "users" where "baz" between ? and ?',
        oracledb: 'select * from "users" where "baz" between ? and ?',
      }
    );
  });

  it('or where between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereBetween('baz', [5, 10])
        .orWhereBetween('baz', [20, 30]),
      {
        mysql:
          'select * from `users` where `baz` between ? and ? or `baz` between ? and ?',
        mssql:
          'select * from [users] where [baz] between ? and ? or [baz] between ? and ?',
        pg:
          'select * from "users" where "baz" between ? and ? or "baz" between ? and ?',
        'pg-redshift':
          'select * from "users" where "baz" between ? and ? or "baz" between ? and ?',
        oracledb:
          'select * from "users" where "baz" between ? and ? or "baz" between ? and ?',
      }
    );
  });

  it('where not between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotBetween('baz', [5, 10]),
      {
        mysql: 'select * from `users` where `baz` not between ? and ?',
        mssql: 'select * from [users] where [baz] not between ? and ?',
        pg: 'select * from "users" where "baz" not between ? and ?',
        'pg-redshift': 'select * from "users" where "baz" not between ? and ?',
        oracledb: 'select * from "users" where "baz" not between ? and ?',
      }
    );
  });

  it('or where not between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotBetween('baz', [5, 10])
        .orWhereNotBetween('baz', [20, 30]),
      {
        mysql:
          'select * from `users` where `baz` not between ? and ? or `baz` not between ? and ?',
        mssql:
          'select * from [users] where [baz] not between ? and ? or [baz] not between ? and ?',
        pg:
          'select * from "users" where "baz" not between ? and ? or "baz" not between ? and ?',
        'pg-redshift':
          'select * from "users" where "baz" not between ? and ? or "baz" not between ? and ?',
        oracledb:
          'select * from "users" where "baz" not between ? and ? or "baz" not between ? and ?',
      }
    );
  });

  it('where in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('baz', [5, 10, 37]),
      {
        mysql: 'select * from `users` where `baz` in (?, ?, ?)',
        mssql: 'select * from [users] where [baz] in (?, ?, ?)',
        pg: 'select * from "users" where "baz" in (?, ?, ?)',
        'pg-redshift': 'select * from "users" where "baz" in (?, ?, ?)',
        oracledb: 'select * from "users" where "baz" in (?, ?, ?)',
      }
    );
  });

  it('or where in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('baz', [5, 10, 37])
        .orWhereIn('foo', ['Batman', 'Joker']),
      {
        mysql:
          'select * from `users` where `baz` in (?, ?, ?) or `foo` in (?, ?)',
        mssql:
          'select * from [users] where [baz] in (?, ?, ?) or [foo] in (?, ?)',
        pg:
          'select * from "users" where "baz" in (?, ?, ?) or "foo" in (?, ?)',
        'pg-redshift':
          'select * from "users" where "baz" in (?, ?, ?) or "foo" in (?, ?)',
        oracledb:
          'select * from "users" where "baz" in (?, ?, ?) or "foo" in (?, ?)',
      }
    );
  });

  it('where not in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotIn('baz', [5, 10, 37]),
      {
        mysql: 'select * from `users` where `baz` not in (?, ?, ?)',
        mssql: 'select * from [users] where [baz] not in (?, ?, ?)',
        pg: 'select * from "users" where "baz" not in (?, ?, ?)',
        'pg-redshift': 'select * from "users" where "baz" not in (?, ?, ?)',
        oracledb: 'select * from "users" where "baz" not in (?, ?, ?)',
      }
    );
  });

  it('or where not in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotIn('baz', [5, 10, 37])
        .orWhereNotIn('foo', ['Batman', 'Joker']),
      {
        mysql:
          'select * from `users` where `baz` not in (?, ?, ?) or `foo` not in (?, ?)',
        mssql:
          'select * from [users] where [baz] not in (?, ?, ?) or [foo] not in (?, ?)',
        pg:
          'select * from "users" where "baz" not in (?, ?, ?) or "foo" not in (?, ?)',
        'pg-redshift':
          'select * from "users" where "baz" not in (?, ?, ?) or "foo" not in (?, ?)',
        oracledb:
          'select * from "users" where "baz" not in (?, ?, ?) or "foo" not in (?, ?)',
      }
    );
  });

  it('limits', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .limit(10),
      {
        mysql: {
          sql: 'select * from `users` limit ?',
          bindings: [10],
        },
        mssql: {
          sql: 'select top (?) * from [users]',
          bindings: [10],
        },
        oracledb: {
          sql: 'select * from (select * from "users") where rownum <= ?',
          bindings: [10],
        },
        pg: {
          sql: 'select * from "users" limit ?',
          bindings: [10],
        },
        'pg-redshift': {
          sql: 'select * from "users" limit ?',
          bindings: [10],
        },
      }
    );
  });

  it('can limit 0', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .limit(0),
      {
        mysql: {
          sql: 'select * from `users` limit ?',
          bindings: [0],
        },
        mssql: {
          sql: 'select top (?) * from [users]',
          bindings: [0],
        },
        oracledb: {
          sql: 'select * from (select * from "users") where rownum <= ?',
          bindings: [0],
        },
        pg: {
          sql: 'select * from "users" limit ?',
          bindings: [0],
        },
        'pg-redshift': {
          sql: 'select * from "users" limit ?',
          bindings: [0],
        },
      }
    );
  });

  it('limits and offsets', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .offset(5)
        .limit(10),
      {
        mysql: {
          sql: 'select * from `users` limit ? offset ?',
          bindings: [10, 5],
        },
        mssql: {
          sql: 'select * from [users] offset ? rows fetch next ? rows only',
          bindings: [5, 10],
        },
        oracledb: {
          sql:
            'select * from (select row_.*, ROWNUM rownum_ from (select * from "users") row_ where rownum <= ?) where rownum_ > ?',
          bindings: [15, 5],
        },
        pg: {
          sql: 'select * from "users" limit ? offset ?',
          bindings: [10, 5],
        },
        'pg-redshift': {
          sql: 'select * from "users" limit ? offset ?',
          bindings: [10, 5],
        },
      }
    );
  });

  it('limits and offsets with raw', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .offset(raw('5'))
        .limit(raw('10')),
      {
        mysql: {
          sql: 'select * from `users` limit ? offset 5',
          bindings: [10],
        },
        mssql: {
          sql: 'select * from [users] offset 5 rows fetch next ? rows only',
          bindings: [10],
        },
        oracledb: {
          sql:
            'select * from (select row_.*, ROWNUM rownum_ from (select * from "users") row_ where rownum <= ?) where rownum_ > 5',
          bindings: [15],
        },
        pg: {
          sql: 'select * from "users" limit ? offset 5',
          bindings: [10],
        },
        'pg-redshift': {
          sql: 'select * from "users" limit ? offset 5',
          bindings: [10],
        },
      }
    );
  });

  it('limits and raw selects', () => {
    testsql(
      qb()
        .select(raw('name = ? as isJohn', ['john']))
        .from('users')
        .limit(1),
      {
        mysql: {
          sql: 'select name = ? as isJohn from `users` limit ?',
          bindings: ['john', 1],
        },
        mssql: {
          sql: 'select top (?) name = ? as isJohn from [users]',
          bindings: [1, 'john'],
        },
        oracledb: {
          sql:
            'select * from (select name = ? as isJohn from "users") where rownum <= ?',
          bindings: ['john', 1],
        },
        pg: {
          sql: 'select name = ? as isJohn from "users" limit ?',
          bindings: ['john', 1],
        },
        'pg-redshift': {
          sql: 'select name = ? as isJohn from "users" limit ?',
          bindings: ['john', 1],
        },
      }
    );
  });

  it('first', () => {
    testsql(
      qb()
        .first('*')
        .from('users'),
      {
        mysql: {
          sql: 'select * from `users` limit ?',
          bindings: [1],
        },
        mssql: {
          sql: 'select top (?) * from [users]',
          bindings: [1],
        },
        oracledb: {
          sql: 'select * from (select * from "users") where rownum <= ?',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "users" limit ?',
          bindings: [1],
        },
        'pg-redshift': {
          sql: 'select * from "users" limit ?',
          bindings: [1],
        },
      }
    );
  });

  it('offsets only', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .offset(5),
      {
        mysql: {
          sql: 'select * from `users` limit 18446744073709551615 offset ?',
          bindings: [5],
        },
        sqlite3: {
          sql: 'select * from `users` limit ? offset ?',
          bindings: [-1, 5],
        },
        pg: {
          sql: 'select * from "users" offset ?',
          bindings: [5],
        },
        'pg-redshift': {
          sql: 'select * from "users" offset ?',
          bindings: [5],
        },
        mssql: {
          sql: 'select * from [users] offset ? rows',
          bindings: [5],
        },
        oracledb: {
          sql:
            'select * from (select row_.*, ROWNUM rownum_ from (select * from "users") row_ where rownum <= ?) where rownum_ > ?',
          bindings: [10000000000005, 5],
        },
      }
    );
  });

  it('where shortcut', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', 1)
        .orWhere('name', 'foo'),
      {
        mysql: {
          sql: 'select * from `users` where `id` = ? or `name` = ?',
          bindings: [1, 'foo'],
        },
        mssql: {
          sql: 'select * from [users] where [id] = ? or [name] = ?',
          bindings: [1, 'foo'],
        },
        pg: {
          sql: 'select * from "users" where "id" = ? or "name" = ?',
          bindings: [1, 'foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" = ? or "name" = ?',
          bindings: [1, 'foo'],
        },
      }
    );
  });

  it('nested wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('email', '=', 'foo')
        .orWhere((qb) => {
          qb.where('name', '=', 'bar').where('age', '=', 25);
        }),
      {
        mysql: {
          sql:
            'select * from `users` where `email` = ? or (`name` = ? and `age` = ?)',
          bindings: ['foo', 'bar', 25],
        },
        mssql: {
          sql:
            'select * from [users] where [email] = ? or ([name] = ? and [age] = ?)',
          bindings: ['foo', 'bar', 25],
        },
        pg: {
          sql:
            'select * from "users" where "email" = ? or ("name" = ? and "age" = ?)',
          bindings: ['foo', 'bar', 25],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "email" = ? or ("name" = ? and "age" = ?)',
          bindings: ['foo', 'bar', 25],
        },
      }
    );
  });

  it('clear nested wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('email', '=', 'foo')
        .orWhere((qb) => {
          qb.where('name', '=', 'bar')
            .where('age', '=', 25)
            .clearWhere();
        }),
      {
        mysql: {
          sql: 'select * from `users` where `email` = ?',
          bindings: ['foo'],
        },
        mssql: {
          sql: 'select * from [users] where [email] = ?',
          bindings: ['foo'],
        },
        pg: {
          sql: 'select * from "users" where "email" = ?',
          bindings: ['foo'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "email" = ?',
          bindings: ['foo'],
        },
      }
    );
  });

  it('clear where and nested wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('email', '=', 'foo')
        .orWhere((qb) => {
          qb.where('name', '=', 'bar').where('age', '=', 25);
        })
        .clearWhere(),
      {
        mysql: {
          sql: 'select * from `users`',
        },
        mssql: {
          sql: 'select * from [users]',
        },
        pg: {
          sql: 'select * from "users"',
        },
        'pg-redshift': {
          sql: 'select * from "users"',
        },
      }
    );
  });

  it('full sub selects', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('email', '=', 'foo')
        // @ts-ignore
        .orWhere('id', '=', (qb) => {
          qb.select(raw('max(id)'))
            .from('users')
            .where('email', '=', 'bar');
        }),
      {
        mysql: {
          sql:
            'select * from `users` where `email` = ? or `id` = (select max(id) from `users` where `email` = ?)',
          bindings: ['foo', 'bar'],
        },
        mssql: {
          sql:
            'select * from [users] where [email] = ? or [id] = (select max(id) from [users] where [email] = ?)',
          bindings: ['foo', 'bar'],
        },
        pg: {
          sql:
            'select * from "users" where "email" = ? or "id" = (select max(id) from "users" where "email" = ?)',
          bindings: ['foo', 'bar'],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "email" = ? or "id" = (select max(id) from "users" where "email" = ?)',
          bindings: ['foo', 'bar'],
        },
      }
    );
  });

  it('clear nested selects', () => {
    testsql(
      qb()
        .select('email')
        .from('users')
        .where('email', '=', 'foo')
        // @ts-ignore
        .orWhere('id', '=', (qb) => {
          qb.select(raw('max(id)'))
            .from('users')
            .where('email', '=', 'bar')
            .clearSelect();
        }),
      {
        mysql: {
          sql:
            'select `email` from `users` where `email` = ? or `id` = (select * from `users` where `email` = ?)',
          bindings: ['foo', 'bar'],
        },
        mssql: {
          sql:
            'select [email] from [users] where [email] = ? or [id] = (select * from [users] where [email] = ?)',
          bindings: ['foo', 'bar'],
        },
        pg: {
          sql:
            'select "email" from "users" where "email" = ? or "id" = (select * from "users" where "email" = ?)',
          bindings: ['foo', 'bar'],
        },
        'pg-redshift': {
          sql:
            'select "email" from "users" where "email" = ? or "id" = (select * from "users" where "email" = ?)',
          bindings: ['foo', 'bar'],
        },
      }
    );
  });

  it('clear non nested selects', () => {
    testsql(
      qb()
        .select('email')
        .from('users')
        .where('email', '=', 'foo')
        // @ts-ignore
        .orWhere('id', '=', (qb) => {
          qb.select(raw('max(id)'))
            .from('users')
            .where('email', '=', 'bar');
        })
        .clearSelect(),
      {
        mysql: {
          sql:
            'select * from `users` where `email` = ? or `id` = (select max(id) from `users` where `email` = ?)',
          bindings: ['foo', 'bar'],
        },
        mssql: {
          sql:
            'select * from [users] where [email] = ? or [id] = (select max(id) from [users] where [email] = ?)',
          bindings: ['foo', 'bar'],
        },
        pg: {
          sql:
            'select * from "users" where "email" = ? or "id" = (select max(id) from "users" where "email" = ?)',
          bindings: ['foo', 'bar'],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "email" = ? or "id" = (select max(id) from "users" where "email" = ?)',
          bindings: ['foo', 'bar'],
        },
      }
    );
  });

  it('where exists', () => {
    testsql(
      qb()
        .select('*')
        .from('orders')
        .whereExists((qb) => {
          qb.select('*')
            .from('products')
            .where('products.id', '=', raw('"orders"."id"'));
        }),
      {
        mysql: {
          sql:
            'select * from `orders` where exists (select * from `products` where `products`.`id` = "orders"."id")',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [orders] where exists (select * from [products] where [products].[id] = "orders"."id")',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "orders" where exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "orders" where exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [],
        },
      }
    );
  });

  it('where exists with builder', () => {
    testsql(
      qb()
        .select('*')
        .from('orders')
        .whereExists(
          qb()
            .select('*')
            .from('products')
            .whereRaw('products.id = orders.id')
        ),
      {
        mysql: {
          sql:
            'select * from `orders` where exists (select * from `products` where products.id = orders.id)',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [orders] where exists (select * from [products] where products.id = orders.id)',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "orders" where exists (select * from "products" where products.id = orders.id)',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "orders" where exists (select * from "products" where products.id = orders.id)',
          bindings: [],
        },
      }
    );
  });

  it('where not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('orders')
        .whereNotExists((qb) => {
          qb.select('*')
            .from('products')
            .where('products.id', '=', raw('"orders"."id"'));
        }),
      {
        mysql: {
          sql:
            'select * from `orders` where not exists (select * from `products` where `products`.`id` = "orders"."id")',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [orders] where not exists (select * from [products] where [products].[id] = "orders"."id")',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "orders" where not exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "orders" where not exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [],
        },
      }
    );
  });

  it('or where exists', () => {
    testsql(
      qb()
        .select('*')
        .from('orders')
        .where('id', '=', 1)
        .orWhereExists((qb) => {
          qb.select('*')
            .from('products')
            .where('products.id', '=', raw('"orders"."id"'));
        }),
      {
        mysql: {
          sql:
            'select * from `orders` where `id` = ? or exists (select * from `products` where `products`.`id` = "orders"."id")',
          bindings: [1],
        },
        mssql: {
          sql:
            'select * from [orders] where [id] = ? or exists (select * from [products] where [products].[id] = "orders"."id")',
          bindings: [1],
        },
        pg: {
          sql:
            'select * from "orders" where "id" = ? or exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [1],
        },
        'pg-redshift': {
          sql:
            'select * from "orders" where "id" = ? or exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [1],
        },
      }
    );
  });

  it('or where not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('orders')
        .where('id', '=', 1)
        .orWhereNotExists((qb) => {
          qb.select('*')
            .from('products')
            .where('products.id', '=', raw('"orders"."id"'));
        }),
      {
        mysql: {
          sql:
            'select * from `orders` where `id` = ? or not exists (select * from `products` where `products`.`id` = "orders"."id")',
          bindings: [1],
        },
        mssql: {
          sql:
            'select * from [orders] where [id] = ? or not exists (select * from [products] where [products].[id] = "orders"."id")',
          bindings: [1],
        },
        pg: {
          sql:
            'select * from "orders" where "id" = ? or not exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [1],
        },
        'pg-redshift': {
          sql:
            'select * from "orders" where "id" = ? or not exists (select * from "products" where "products"."id" = "orders"."id")',
          bindings: [1],
        },
      }
    );
  });

  it('cross join', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        // @ts-ignore
        .crossJoin('contracts')
        .crossJoin('photos'),
      {
        mysql: {
          sql:
            'select * from `users` cross join `contracts` cross join `photos`',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [users] cross join [contracts] cross join [photos]',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" cross join "contracts" cross join "photos"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" cross join "contracts" cross join "photos"',
          bindings: [],
        },
        sqlite3: {
          sql:
            'select * from `users` cross join `contracts` cross join `photos`',
          bindings: [],
        },
        oracledb: {
          sql:
            'select * from "users" cross join "contracts" cross join "photos"',
          bindings: [],
        },
      }
    );
  });

  it('full outer join', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .fullOuterJoin('contacts', 'users.id', '=', 'contacts.id'),
      {
        mssql: {
          sql:
            'select * from [users] full outer join [contacts] on [users].[id] = [contacts].[id]',
          bindings: [],
        },
        oracledb: {
          sql:
            'select * from "users" full outer join "contacts" on "users"."id" = "contacts"."id"',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" full outer join "contacts" on "users"."id" = "contacts"."id"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" full outer join "contacts" on "users"."id" = "contacts"."id"',
          bindings: [],
        },
      }
    );
  });

  it('cross join on', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .crossJoin('contracts', 'users.contractId', 'contracts.id'),
      {
        mysql: {
          sql:
            'select * from `users` cross join `contracts` on `users`.`contractId` = `contracts`.`id`',
          bindings: [],
        },
        sqlite3: {
          sql:
            'select * from `users` cross join `contracts` on `users`.`contractId` = `contracts`.`id`',
          bindings: [],
        },
      }
    );
  });

  it('basic joins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', 'users.id', '=', 'contacts.id')
        .leftJoin('photos', 'users.id', '=', 'photos.id'),
      {
        mysql: {
          sql:
            'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` left join `photos` on `users`.`id` = `photos`.`id`',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] left join [photos] on [users].[id] = [photos].[id]',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" left join "photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" left join "photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
      }
    );
  });

  it('right (outer) joins', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .rightJoin('contacts', 'users.id', '=', 'contacts.id')
        .rightOuterJoin('photos', 'users.id', '=', 'photos.id'),
      {
        mssql: {
          sql:
            'select * from [users] right join [contacts] on [users].[id] = [contacts].[id] right outer join [photos] on [users].[id] = [photos].[id]',
          bindings: [],
        },
        mysql: {
          sql:
            'select * from `users` right join `contacts` on `users`.`id` = `contacts`.`id` right outer join `photos` on `users`.`id` = `photos`.`id`',
          bindings: [],
        },
        oracledb: {
          sql:
            'select * from "users" right join "contacts" on "users"."id" = "contacts"."id" right outer join "photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" right join "contacts" on "users"."id" = "contacts"."id" right outer join "photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" right join "contacts" on "users"."id" = "contacts"."id" right outer join "photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
      }
    );
  });

  it('complex join', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').orOn(
            'users.name',
            '=',
            'contacts.name'
          );
        }),
      {
        mysql: {
          sql:
            'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` or `users`.`name` = `contacts`.`name`',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] or [users].[name] = [contacts].[name]',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" or "users"."name" = "contacts"."name"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" or "users"."name" = "contacts"."name"',
          bindings: [],
        },
      }
    );
  });

  it('complex join with nest conditional statements', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on((qb) => {
            qb.on('users.id', '=', 'contacts.id');
            qb.orOn('users.name', '=', 'contacts.name');
          });
        }),
      {
        mysql: {
          sql:
            'select * from `users` inner join `contacts` on (`users`.`id` = `contacts`.`id` or `users`.`name` = `contacts`.`name`)',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [users] inner join [contacts] on ([users].[id] = [contacts].[id] or [users].[name] = [contacts].[name])',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" inner join "contacts" on ("users"."id" = "contacts"."id" or "users"."name" = "contacts"."name")',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" inner join "contacts" on ("users"."id" = "contacts"."id" or "users"."name" = "contacts"."name")',
          bindings: [],
        },
      }
    );
  });

  it('complex join with empty in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onIn('users.name', []);
        }),
      {
        mysql: {
          sql:
            'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and 1 = 0',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and 1 = 0',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and 1 = 0',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and 1 = 0',
          bindings: [],
        },
      }
    );
  });

  it('joins with raw', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', 'users.id', raw(1))
        .leftJoin('photos', 'photos.title', '=', raw('?', ['My Photo'])),
      {
        mysql: {
          sql:
            'select * from `users` inner join `contacts` on `users`.`id` = 1 left join `photos` on `photos`.`title` = ?',
          bindings: ['My Photo'],
        },
        mssql: {
          sql:
            'select * from [users] inner join [contacts] on [users].[id] = 1 left join [photos] on [photos].[title] = ?',
          bindings: ['My Photo'],
        },
        pg: {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = 1 left join "photos" on "photos"."title" = ?',
          bindings: ['My Photo'],
        },
        'pg-redshift': {
          sql:
            'select * from "users" inner join "contacts" on "users"."id" = 1 left join "photos" on "photos"."title" = ?',
          bindings: ['My Photo'],
        },
      }
    );
  });

  it('joins with schema', () => {
    testsql(
      qb()
        .withSchema('myschema')
        .select('*')
        .from('users')
        .join('contacts', 'users.id', '=', 'contacts.id')
        .leftJoin('photos', 'users.id', '=', 'photos.id'),
      {
        mysql: {
          sql:
            'select * from `myschema`.`users` inner join `myschema`.`contacts` on `users`.`id` = `contacts`.`id` left join `myschema`.`photos` on `users`.`id` = `photos`.`id`',
          bindings: [],
        },
        mssql: {
          sql:
            'select * from [myschema].[users] inner join [myschema].[contacts] on [users].[id] = [contacts].[id] left join [myschema].[photos] on [users].[id] = [photos].[id]',
          bindings: [],
        },
        pg: {
          sql:
            'select * from "myschema"."users" inner join "myschema"."contacts" on "users"."id" = "contacts"."id" left join "myschema"."photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select * from "myschema"."users" inner join "myschema"."contacts" on "users"."id" = "contacts"."id" left join "myschema"."photos" on "users"."id" = "photos"."id"',
          bindings: [],
        },
      }
    );
  });

  it('on null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onNull('contacts.address');
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`address` is null',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[address] is null',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is null',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is null',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is null',
      }
    );
  });

  it('or on null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onNull('contacts.address')
            .orOnNull('contacts.phone');
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`address` is null or `contacts`.`phone` is null',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[address] is null or [contacts].[phone] is null',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is null or "contacts"."phone" is null',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is null or "contacts"."phone" is null',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is null or "contacts"."phone" is null',
      }
    );
  });

  it('on not null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onNotNull('contacts.address');
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`address` is not null',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[address] is not null',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is not null',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is not null',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is not null',
      }
    );
  });

  it('or on not null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onNotNull('contacts.address')
            .orOnNotNull('contacts.phone');
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`address` is not null or `contacts`.`phone` is not null',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[address] is not null or [contacts].[phone] is not null',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is not null or "contacts"."phone" is not null',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is not null or "contacts"."phone" is not null',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."address" is not null or "contacts"."phone" is not null',
      }
    );
  });

  it('on exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onExists(function() {
            // @ts-ignore
            this.select('*').from('foo');
          });
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and exists (select * from `foo`)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and exists (select * from [foo])',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and exists (select * from "foo")',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and exists (select * from "foo")',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and exists (select * from "foo")',
      }
    );
  });

  it('or on exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onExists(function() {
              // @ts-ignore
              this.select('*').from('foo');
            })
            .orOnExists(function() {
              // @ts-ignore
              this.select('*').from('bar');
            });
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and exists (select * from `foo`) or exists (select * from `bar`)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and exists (select * from [foo]) or exists (select * from [bar])',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and exists (select * from "foo") or exists (select * from "bar")',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and exists (select * from "foo") or exists (select * from "bar")',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and exists (select * from "foo") or exists (select * from "bar")',
      }
    );
  });

  it('on not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onNotExists(function() {
            // @ts-ignore
            this.select('*').from('foo');
          });
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and not exists (select * from `foo`)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and not exists (select * from [foo])',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and not exists (select * from "foo")',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and not exists (select * from "foo")',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and not exists (select * from "foo")',
      }
    );
  });

  it('or on not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onNotExists(function() {
              // @ts-ignore
              this.select('*').from('foo');
            })
            .orOnNotExists(function() {
              // @ts-ignore
              this.select('*').from('bar');
            });
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and not exists (select * from `foo`) or not exists (select * from `bar`)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and not exists (select * from [foo]) or not exists (select * from [bar])',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and not exists (select * from "foo") or not exists (select * from "bar")',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and not exists (select * from "foo") or not exists (select * from "bar")',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and not exists (select * from "foo") or not exists (select * from "bar")',
      }
    );
  });

  it('on between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onBetween('contacts.id', [
            7,
            15,
          ]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` between ? and ?',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] between ? and ?',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" between ? and ?',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" between ? and ?',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" between ? and ?',
      }
    );
  });

  it('or on between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onBetween('contacts.id', [7, 15])
            .orOnBetween('users.id', [9, 14]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` between ? and ? or `users`.`id` between ? and ?',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] between ? and ? or [users].[id] between ? and ?',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" between ? and ? or "users"."id" between ? and ?',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" between ? and ? or "users"."id" between ? and ?',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" between ? and ? or "users"."id" between ? and ?',
      }
    );
  });

  it('on not between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onNotBetween('contacts.id', [
            7,
            15,
          ]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` not between ? and ?',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] not between ? and ?',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not between ? and ?',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not between ? and ?',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not between ? and ?',
      }
    );
  });

  it('or on not between', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onNotBetween('contacts.id', [7, 15])
            .orOnNotBetween('users.id', [9, 14]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` not between ? and ? or `users`.`id` not between ? and ?',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] not between ? and ? or [users].[id] not between ? and ?',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not between ? and ? or "users"."id" not between ? and ?',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not between ? and ? or "users"."id" not between ? and ?',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not between ? and ? or "users"."id" not between ? and ?',
      }
    );
  });

  it('on in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onIn('contacts.id', [
            7,
            15,
            23,
            41,
          ]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` in (?, ?, ?, ?)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] in (?, ?, ?, ?)',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" in (?, ?, ?, ?)',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" in (?, ?, ?, ?)',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" in (?, ?, ?, ?)',
      }
    );
  });

  it('or on in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onIn('contacts.id', [7, 15, 23, 41])
            .orOnIn('users.id', [21, 37]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` in (?, ?, ?, ?) or `users`.`id` in (?, ?)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] in (?, ?, ?, ?) or [users].[id] in (?, ?)',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" in (?, ?, ?, ?) or "users"."id" in (?, ?)',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" in (?, ?, ?, ?) or "users"."id" in (?, ?)',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" in (?, ?, ?, ?) or "users"."id" in (?, ?)',
      }
    );
  });

  it('on not in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onNotIn('contacts.id', [
            7,
            15,
            23,
            41,
          ]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` not in (?, ?, ?, ?)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] not in (?, ?, ?, ?)',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not in (?, ?, ?, ?)',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not in (?, ?, ?, ?)',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not in (?, ?, ?, ?)',
      }
    );
  });

  it('or on not in', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id')
            .onNotIn('contacts.id', [7, 15, 23, 41])
            .orOnNotIn('users.id', [21, 37]);
        }),
      {
        mysql:
          'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` and `contacts`.`id` not in (?, ?, ?, ?) or `users`.`id` not in (?, ?)',
        mssql:
          'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] and [contacts].[id] not in (?, ?, ?, ?) or [users].[id] not in (?, ?)',
        pg:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not in (?, ?, ?, ?) or "users"."id" not in (?, ?)',
        'pg-redshift':
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not in (?, ?, ?, ?) or "users"."id" not in (?, ?)',
        oracledb:
          'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" and "contacts"."id" not in (?, ?, ?, ?) or "users"."id" not in (?, ?)',
      }
    );
  });

  it('raw expressions in select', () => {
    testsql(
      qb()
        .select(raw('substr(foo, 6)'))
        .from('users'),
      {
        mysql: {
          sql: 'select substr(foo, 6) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select substr(foo, 6) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select substr(foo, 6) from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select substr(foo, 6) from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count', () => {
    testsql(
      qb()
        .from('users')
        .count(),
      {
        mysql: {
          sql: 'select count(*) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(*) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select count(*) from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select count(*) from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count distinct', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct(),
      {
        mysql: {
          sql: 'select count(distinct *) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(distinct *) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select count(distinct *) from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select count(distinct *) from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count with string alias', () => {
    testsql(
      qb()
        .from('users')
        .count('* as all'),
      {
        mysql: {
          sql: 'select count(*) as `all` from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(*) as [all] from [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'select count(*) "all" from "users"',
          bindings: [],
        },
        pg: {
          sql: 'select count(*) as "all" from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select count(*) as "all" from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count with object alias', () => {
    testsql(
      qb()
        .from('users')
        .count({ all: '*' }),
      {
        mysql: {
          sql: 'select count(*) as `all` from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(*) as [all] from [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'select count(*) "all" from "users"',
          bindings: [],
        },
        pg: {
          sql: 'select count(*) as "all" from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select count(*) as "all" from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count distinct with string alias', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct('* as all'),
      {
        mysql: {
          sql: 'select count(distinct *) as `all` from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(distinct *) as [all] from [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'select count(distinct *) "all" from "users"',
          bindings: [],
        },
        pg: {
          sql: 'select count(distinct *) as "all" from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select count(distinct *) as "all" from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count distinct with object alias', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct({ all: '*' }),
      {
        mysql: {
          sql: 'select count(distinct *) as `all` from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(distinct *) as [all] from [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'select count(distinct *) "all" from "users"',
          bindings: [],
        },
        pg: {
          sql: 'select count(distinct *) as "all" from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select count(distinct *) as "all" from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count with raw values', () => {
    testsql(
      qb()
        .from('users')
        .count(raw('??', 'name')),
      {
        mysql: {
          sql: 'select count(`name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count([name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select count("name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count distinct with raw values', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct(raw('??', 'name')),
      {
        mysql: {
          sql: 'select count(distinct `name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(distinct [name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select count(distinct "name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count distinct with multiple columns', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct('foo', 'bar'),
      {
        mysql: {
          sql: 'select count(distinct `foo`, `bar`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(distinct [foo], [bar]) from [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'select count(distinct "foo", "bar") from "users"',
          bindings: [],
        },
        pg: {
          sql: 'select count(distinct("foo", "bar")) from "users"',
          bindings: [],
        },
      }
    );
  });

  it('count distinct with multiple columns with alias', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct({ alias: ['foo', 'bar'] }),
      {
        mysql: {
          sql: 'select count(distinct `foo`, `bar`) as `alias` from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select count(distinct [foo], [bar]) as [alias] from [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'select count(distinct "foo", "bar") "alias" from "users"',
          bindings: [],
        },
        pg: {
          sql: 'select count(distinct("foo", "bar")) as "alias" from "users"',
          bindings: [],
        },
      }
    );
  });

  it('max', () => {
    testsql(
      qb()
        .from('users')
        .max('id'),
      {
        mysql: {
          sql: 'select max(`id`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select max([id]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select max("id") from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select max("id") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('max with raw values', () => {
    testsql(
      qb()
        .from('users')
        .max(raw('??', ['name'])),
      {
        mysql: {
          sql: 'select max(`name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select max([name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select max("name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('min', () => {
    testsql(
      qb()
        .from('users')
        .max('id'),
      {
        mysql: {
          sql: 'select max(`id`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select max([id]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select max("id") from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select max("id") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('min with raw values', () => {
    testsql(
      qb()
        .from('users')
        .min(raw('??', ['name'])),
      {
        mysql: {
          sql: 'select min(`name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select min([name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select min("name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('sum', () => {
    testsql(
      qb()
        .from('users')
        .sum('id'),
      {
        mysql: {
          sql: 'select sum(`id`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select sum([id]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select sum("id") from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select sum("id") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('sum with raw values', () => {
    testsql(
      qb()
        .from('users')
        .sum(raw('??', ['name'])),
      {
        mysql: {
          sql: 'select sum(`name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select sum([name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select sum("name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('sum distinct', () => {
    testsql(
      qb()
        .from('users')
        .sumDistinct('id'),
      {
        mysql: {
          sql: 'select sum(distinct `id`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select sum(distinct [id]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select sum(distinct "id") from "users"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select sum(distinct "id") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('sum distinct with raw values', () => {
    testsql(
      qb()
        .from('users')
        .sumDistinct(raw('??', ['name'])),
      {
        mysql: {
          sql: 'select sum(distinct `name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select sum(distinct [name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select sum(distinct "name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('avg', () => {
    testsql(
      qb()
        .from('users')
        .avg('id'),
      {
        mysql: {
          sql: 'select avg(`id`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select avg([id]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select avg("id") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('avg with raw values', () => {
    testsql(
      qb()
        .from('users')
        .avg(raw('??', ['name'])),
      {
        mysql: {
          sql: 'select avg(`name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select avg([name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select avg("name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('avg distinct with raw values', () => {
    testsql(
      qb()
        .from('users')
        .avgDistinct(raw('??', ['name'])),
      {
        mysql: {
          sql: 'select avg(distinct `name`) from `users`',
          bindings: [],
        },
        mssql: {
          sql: 'select avg(distinct [name]) from [users]',
          bindings: [],
        },
        pg: {
          sql: 'select avg(distinct "name") from "users"',
          bindings: [],
        },
      }
    );
  });

  it('insert method', () => {
    testsql(
      qb()
        .into('users')
        .insert({ email: 'foo' }),
      {
        mysql: {
          sql: 'insert into `users` (`email`) values (?)',
          bindings: ['foo'],
        },
        mssql: {
          sql: 'insert into [users] ([email]) values (?)',
          bindings: ['foo'],
        },
        pg: {
          sql: 'insert into "users" ("email") values (?)',
          bindings: ['foo'],
        },
        'pg-redshift': {
          sql: 'insert into "users" ("email") values (?)',
          bindings: ['foo'],
        },
      }
    );
  });

  it('multiple inserts', () => {
    testsql(
      qb()
        .from('users')
        .insert([
          { email: 'foo', name: 'taylor' },
          { email: 'bar', name: 'dayle' },
        ]),
      {
        mysql: {
          sql: 'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        sqlite3: {
          sql:
            'insert into `users` (`email`, `name`) select ? as `email`, ? as `name` union all select ? as `email`, ? as `name`',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        mssql: {
          sql: 'insert into [users] ([email], [name]) values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        oracledb: {
          sql:
            'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using ?, ?; execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using ?, ?;end;',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        pg: {
          sql: 'insert into "users" ("email", "name") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        'pg-redshift': {
          sql: 'insert into "users" ("email", "name") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
      }
    );
  });

  it('multiple inserts with partly undefined keys client with configuration nullAsDefault: true', () => {
    testquery(
      qb()
        .from('users')
        .insert([{ email: 'foo', name: 'taylor' }, { name: 'dayle' }]),
      {
        mysql:
          "insert into `users` (`email`, `name`) values ('foo', 'taylor'), (NULL, 'dayle')",
        sqlite3:
          "insert into `users` (`email`, `name`) select 'foo' as `email`, 'taylor' as `name` union all select NULL as `email`, 'dayle' as `name`",
        mssql:
          "insert into [users] ([email], [name]) values ('foo', 'taylor'), (NULL, 'dayle')",
        oracledb:
          'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using \'foo\', \'taylor\'; execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using NULL, \'dayle\';end;',
        pg:
          'insert into "users" ("email", "name") values (\'foo\', \'taylor\'), (NULL, \'dayle\')',
        'pg-redshift':
          'insert into "users" ("email", "name") values (\'foo\', \'taylor\'), (NULL, \'dayle\')',
      },
      clientsWithNullAsDefault
    );
  });

  it('multiple inserts with partly undefined keys', () => {
    testquery(
      qb()
        .from('users')
        .insert([{ email: 'foo', name: 'taylor' }, { name: 'dayle' }]),
      {
        mysql:
          "insert into `users` (`email`, `name`) values ('foo', 'taylor'), (DEFAULT, 'dayle')",
        mssql:
          "insert into [users] ([email], [name]) values ('foo', 'taylor'), (DEFAULT, 'dayle')",
        oracledb:
          'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using \'foo\', \'taylor\'; execute immediate \'insert into "users" ("email", "name") values (DEFAULT, :1)\' using \'dayle\';end;',
        pg:
          'insert into "users" ("email", "name") values (\'foo\', \'taylor\'), (DEFAULT, \'dayle\')',
        'pg-redshift':
          'insert into "users" ("email", "name") values (\'foo\', \'taylor\'), (DEFAULT, \'dayle\')',
      }
    );
  });

  it('multiple inserts with partly undefined keys throw error with sqlite', () => {
    expect(() => {
      testquery(
        qb()
          .from('users')
          .insert([{ email: 'foo', name: 'taylor' }, { name: 'dayle' }]),
        {
          sqlite3: '',
        }
      );
    }).toThrow(TypeError);
  });

  it('multiple inserts with returning', () => {
    // returning only supported directly by postgres and with workaround with oracle
    // other databases implicitly return the inserted id
    testsql(
      qb()
        .from('users')
        .insert(
          [{ email: 'foo', name: 'taylor' }, { email: 'bar', name: 'dayle' }],
          'id'
        ),
      {
        mysql: {
          sql: 'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        sqlite3: {
          sql:
            'insert into `users` (`email`, `name`) select ? as `email`, ? as `name` union all select ? as `email`, ? as `name`',
        },
        pg: {
          sql:
            'insert into "users" ("email", "name") values (?, ?), (?, ?) returning "id"',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        'pg-redshift': {
          sql: 'insert into "users" ("email", "name") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        mssql: {
          sql:
            'insert into [users] ([email], [name]) output inserted.[id] values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        oracledb: {
          sql:
            'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2) returning "id" into :3\' using ?, ?, out ?; execute immediate \'insert into "users" ("email", "name") values (:1, :2) returning "id" into :3\' using ?, ?, out ?;end;',
          bindings: (bindings) => {
            expect(bindings.length).toEqual(6);
            expect(bindings[0]).toEqual('foo');
            expect(bindings[1]).toEqual('taylor');
            expect(bindings[2].toString()).toEqual(
              '[object ReturningHelper:id]'
            );
            expect(bindings[3]).toEqual('bar');
            expect(bindings[4]).toEqual('dayle');
            expect(bindings[5].toString()).toEqual(
              '[object ReturningHelper:id]'
            );
          },
        },
      }
    );
  });

  it('multiple inserts with multiple returning', () => {
    testsql(
      qb()
        .from('users')
        .insert(
          [{ email: 'foo', name: 'taylor' }, { email: 'bar', name: 'dayle' }],
          ['id', 'name']
        ),
      {
        mysql: {
          sql: 'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        sqlite3: {
          sql:
            'insert into `users` (`email`, `name`) select ? as `email`, ? as `name` union all select ? as `email`, ? as `name`',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        pg: {
          sql:
            'insert into "users" ("email", "name") values (?, ?), (?, ?) returning "id", "name"',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        'pg-redshift': {
          sql: 'insert into "users" ("email", "name") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        mssql: {
          sql:
            'insert into [users] ([email], [name]) output inserted.[id], inserted.[name] values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        },
        oracledb: {
          sql:
            'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2) returning "id","name" into :3, :4\' using ?, ?, out ?, out ?; execute immediate \'insert into "users" ("email", "name") values (:1, :2) returning "id","name" into :3, :4\' using ?, ?, out ?, out ?;end;',
          bindings: (bindings) => {
            expect(bindings.length).toEqual(8);
            expect(bindings[0]).toEqual('foo');
            expect(bindings[1]).toEqual('taylor');
            expect(bindings[2].toString()).toEqual(
              '[object ReturningHelper:id]'
            );
            expect(bindings[3].toString()).toEqual(
              '[object ReturningHelper:name]'
            );
            expect(bindings[4]).toEqual('bar');
            expect(bindings[5]).toEqual('dayle');
            expect(bindings[6].toString()).toEqual(
              '[object ReturningHelper:id]'
            );
            expect(bindings[7].toString()).toEqual(
              '[object ReturningHelper:name]'
            );
          },
        },
      }
    );
  });

  it('insert method respects raw bindings', () => {
    testsql(
      qb()
        .insert({ email: raw('CURRENT TIMESTAMP') })
        .into('users'),
      {
        mysql: {
          sql: 'insert into `users` (`email`) values (CURRENT TIMESTAMP)',
          bindings: [],
        },
        mssql: {
          sql: 'insert into [users] ([email]) values (CURRENT TIMESTAMP)',
          bindings: [],
        },
        pg: {
          sql: 'insert into "users" ("email") values (CURRENT TIMESTAMP)',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'insert into "users" ("email") values (CURRENT TIMESTAMP)',
          bindings: [],
        },
      }
    );
  });

  it('normalizes for missing keys in insert', () => {
    const data = [{ a: 1 }, { b: 2 }, { a: 2, c: 3 }];

    testsql(
      qb()
        .insert(data)
        .into('table'),
      {
        "snowflake-sdk": {
          sql:
            'insert into `table` (`a`, `b`, `c`) values (?, DEFAULT, DEFAULT), (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
          bindings: [1, 2, 2, 3],
        }
      }
    );
  });

  it('empty insert should be a noop', () => {
    testsql(
      qb()
        .into('users')
        // @ts-ignore
        .insert(),
      {
        "snowflake-sdk": {
          sql: '',
          bindings: [],
        }
      }
    );
  });

  it('insert with empty array should be a noop', () => {
    testsql(
      qb()
        .into('users')
        .insert([]),
      {
        mysql: {
          sql: '',
          bindings: [],
        },
        mssql: {
          sql: '',
          bindings: [],
        },
        oracledb: {
          sql: '',
          bindings: [],
        },
        pg: {
          sql: '',
          bindings: [],
        },
        'pg-redshift': {
          sql: '',
          bindings: [],
        },
      }
    );
  });

  it('insert with array with empty object and returning', () => {
    testsql(
      qb()
        .into('users')
        .insert([{}], 'id'),
      {
        mysql: {
          sql: 'insert into `users` () values ()',
          bindings: [],
        },
        sqlite3: {
          sql: 'insert into `users` default values',
          bindings: [],
        },
        pg: {
          sql: 'insert into "users" default values returning "id"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'insert into "users" default values',
          bindings: [],
        },
        mssql: {
          sql: 'insert into [users] output inserted.[id] default values',
          bindings: [],
        },
        oracledb: {
          sql:
            'insert into "users" ("id") values (default) returning "id" into ?',
          bindings: (bindings) => {
            expect(bindings.length).toEqual(1);
            expect(bindings[0].toString()).toEqual(
              '[object ReturningHelper:id]'
            );
          },
        },
      }
    );
  });

  it('update method', () => {
    testsql(
      qb()
        .update({ email: 'foo', name: 'bar' })
        .table('users')
        .where('id', '=', 1),
      {
        mysql: {
          sql: 'update `users` set `email` = ?, `name` = ? where `id` = ?',
          bindings: ['foo', 'bar', 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = ?, [name] = ? where [id] = ?;select @@rowcount',
          bindings: ['foo', 'bar', 1],
        },
        pg: {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('update only method', () => {
    testsql(
      qb()
        .update({ email: 'foo', name: 'bar' })
        .table('users', { only: true })
        .where('id', '=', 1),
      {
        pg: {
          sql: 'update only "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('should not update columns undefined values', () => {
    testsql(
      qb()
        .update({ email: 'foo', name: undefined })
        .table('users')
        .where('id', '=', 1),
      {
        mysql: {
          sql: 'update `users` set `email` = ? where `id` = ?',
          bindings: ['foo', 1],
        },
        pg: {
          sql: 'update "users" set "email" = ? where "id" = ?',
          bindings: ['foo', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = ? where "id" = ?',
          bindings: ['foo', 1],
        },
      }
    );
  });

  it("should allow for 'null' updates", () => {
    testsql(
      qb()
        .update({ email: null, name: 'bar' })
        .table('users')
        .where('id', 1),
      {
        mysql: {
          sql: 'update `users` set `email` = ?, `name` = ? where `id` = ?',
          bindings: [null, 'bar', 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = ?, [name] = ? where [id] = ?;select @@rowcount',
          bindings: [null, 'bar', 1],
        },
        pg: {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: [null, 'bar', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: [null, 'bar', 1],
        },
      }
    );
  });

  it('order by, limit', () => {
    // update with limit works only with mysql and derrivates
    testsql(
      qb()
        .from('users')
        .where('id', '=', 1)
        .orderBy('foo', 'desc')
        .limit(5)
        .update({ email: 'foo', name: 'bar' }),
      {
        mysql: {
          sql:
            'update `users` set `email` = ?, `name` = ? where `id` = ? order by `foo` desc limit ?',
          bindings: ['foo', 'bar', 1, 5],
        },
        mssql: {
          sql:
            'update top (?) [users] set [email] = ?, [name] = ? where [id] = ? order by [foo] desc;select @@rowcount',
          bindings: [5, 'foo', 'bar', 1],
        },
        pg: {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('update method with joins mysql', () => {
    testsql(
      qb()
        .from('users')
        .join('orders', 'users.id', 'orders.user_id')
        .where('users.id', '=', 1)
        .update({ email: 'foo', name: 'bar' }),
      {
        mysql: {
          sql:
            'update `users` inner join `orders` on `users`.`id` = `orders`.`user_id` set `email` = ?, `name` = ? where `users`.`id` = ?',
          bindings: ['foo', 'bar', 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = ?, [name] = ? from [users] inner join [orders] on [users].[id] = [orders].[user_id] where [users].[id] = ?;select @@rowcount',
          bindings: ['foo', 'bar', 1],
        },
        pg: {
          sql:
            'update "users" set "email" = ?, "name" = ? where "users"."id" = ?',
          bindings: ['foo', 'bar', 1],
        },
        'pg-redshift': {
          sql:
            'update "users" set "email" = ?, "name" = ? where "users"."id" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('update method with limit mysql', () => {
    // limit works only with mysql or derrivates
    testsql(
      qb()
        .from('users')
        .where('users.id', '=', 1)
        .update({ email: 'foo', name: 'bar' })
        .limit(1),
      {
        mysql: {
          sql:
            'update `users` set `email` = ?, `name` = ? where `users`.`id` = ? limit ?',
          bindings: ['foo', 'bar', 1, 1],
        },
        mssql: {
          sql:
            'update top (?) [users] set [email] = ?, [name] = ? where [users].[id] = ?;select @@rowcount',
          bindings: [1, 'foo', 'bar', 1],
        },
        pg: {
          sql:
            'update "users" set "email" = ?, "name" = ? where "users"."id" = ?',
          bindings: ['foo', 'bar', 1],
        },
        'pg-redshift': {
          sql:
            'update "users" set "email" = ?, "name" = ? where "users"."id" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('update method without joins on postgres', () => {
    testsql(
      qb()
        .from('users')
        .where('id', '=', 1)
        .update({ email: 'foo', name: 'bar' }),
      {
        mysql: {
          sql: 'update `users` set `email` = ?, `name` = ? where `id` = ?',
          bindings: ['foo', 'bar', 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = ?, [name] = ? where [id] = ?;select @@rowcount',
          bindings: ['foo', 'bar', 1],
        },
        pg: {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('update method with returning on oracle', () => {
    testsql(
      qb()
        .from('users')
        .where('id', '=', 1)
        .update({ email: 'foo', name: 'bar' }, '*'),
      {
        oracledb: {
          sql:
            'update "users" set "email" = ?, "name" = ? where "id" = ? returning "ROWID" into ?',
          bindings: (bindings) => {
            expect(bindings.length).toEqual(4);
            expect(bindings[0]).toEqual('foo');
            expect(bindings[1]).toEqual('bar');
            expect(bindings[2]).toEqual(1);
            expect(bindings[3].toString()).toEqual(
              '[object ReturningHelper:ROWID]'
            );
          },
        },
      }
    );
  });

  // TODO:
  // it("update method with joins on postgres", function() {
  //   chain = qb().from('users').join('orders', 'users.id', '=', 'orders.user_id').where('users.id', '=', 1).update({email: 'foo', name: 'bar'}).toSQL();
  //   expect(chain.sql).toEqual('update "users" set "email" = ?, "name" = ? from "orders" where "users"."id" = ? and "users"."id" = "orders"."user_id"');
  //   expect(chain.sql).to.eql(['foo', 'bar', 1]);
  // });

  it('update method respects raw', () => {
    testsql(
      qb()
        .from('users')
        .where('id', '=', 1)
        .update({ email: raw('foo'), name: 'bar' }),
      {
        mysql: {
          sql: 'update `users` set `email` = foo, `name` = ? where `id` = ?',
          bindings: ['bar', 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = foo, [name] = ? where [id] = ?;select @@rowcount',
          bindings: ['bar', 1],
        },
        pg: {
          sql: 'update "users" set "email" = foo, "name" = ? where "id" = ?',
          bindings: ['bar', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = foo, "name" = ? where "id" = ?',
          bindings: ['bar', 1],
        },
      }
    );
  });

  it('increment method', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .increment('balance', 10),
      {
        mysql: {
          sql: 'update `users` set `balance` = `balance` + ? where `id` = ?',
          bindings: [10, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] + ? where [id] = ?;select @@rowcount',
          bindings: [10, 1],
        },
        pg: {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [10, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [10, 1],
        },
      }
    );
  });

  it('Calling increment multiple times on same column overwrites the previous value', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .increment('balance', 10)
        .increment('balance', 20),
      {
        pg: {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [20, 1],
        },
        mysql: {
          sql: 'update `users` set `balance` = `balance` + ? where `id` = ?',
          bindings: [20, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] + ? where [id] = ?;select @@rowcount',
          bindings: [20, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [20, 1],
        },
      }
    );
  });

  it('Calling increment and then decrement will overwrite the previous value', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .increment('balance', 10)
        .decrement('balance', 90),
      {
        pg: {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [90, 1],
        },
        mysql: {
          sql: 'update `users` set `balance` = `balance` - ? where `id` = ?',
          bindings: [90, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] - ? where [id] = ?;select @@rowcount',
          bindings: [90, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [90, 1],
        },
      }
    );
  });

  it('Calling decrement multiple times on same column overwrites the previous value', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .decrement('balance', 10)
        .decrement('balance', 20),
      {
        pg: {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [20, 1],
        },
        mysql: {
          sql: 'update `users` set `balance` = `balance` - ? where `id` = ?',
          bindings: [20, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] - ? where [id] = ?;select @@rowcount',
          bindings: [20, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [20, 1],
        },
      }
    );
  });

  it('Calling decrement and then increment will overwrite the previous value', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .decrement('balance', 10)
        .increment('balance', 90),
      {
        pg: {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [90, 1],
        },
        mysql: {
          sql: 'update `users` set `balance` = `balance` + ? where `id` = ?',
          bindings: [90, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] + ? where [id] = ?;select @@rowcount',
          bindings: [90, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [90, 1],
        },
      }
    );
  });

  it('Can chain increment / decrement with .update in same build-chain', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .update({
          email: 'foo@bar.com',
        })
        .increment('balance', 10)
        .decrement('subbalance', 100),
      {
        pg: {
          sql:
            'update "users" set "email" = ?, "balance" = "balance" + ?, "subbalance" = "subbalance" - ? where "id" = ?',
          bindings: ['foo@bar.com', 10, 100, 1],
        },
        mysql: {
          sql:
            'update `users` set `email` = ?, `balance` = `balance` + ?, `subbalance` = `subbalance` - ? where `id` = ?',
          bindings: ['foo@bar.com', 10, 100, 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = ?, [balance] = [balance] + ?, [subbalance] = [subbalance] - ? where [id] = ?;select @@rowcount',
          bindings: ['foo@bar.com', 10, 100, 1],
        },
        'pg-redshift': {
          sql:
            'update "users" set "email" = ?, "balance" = "balance" + ?, "subbalance" = "subbalance" - ? where "id" = ?',
          bindings: ['foo@bar.com', 10, 100, 1],
        },
      }
    );
  });

  it('Can chain increment / decrement with .update in same build-chain and ignores increment/decrement if column is also supplied in .update', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .update({
          balance: 500,
        })
        .increment('balance', 10)
        .decrement('balance', 100),
      {
        pg: {
          sql: 'update "users" set "balance" = ? where "id" = ?',
          bindings: [500, 1],
        },
        mysql: {
          sql: 'update `users` set `balance` = ? where `id` = ?',
          bindings: [500, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = ? where [id] = ?;select @@rowcount',
          bindings: [500, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = ? where "id" = ?',
          bindings: [500, 1],
        },
      }
    );
  });

  it('Can use object syntax for increment/decrement', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        // @ts-ignore
        .increment({
          balance: 10,
          times: 1,
        })
        .decrement({
          value: 50,
          subvalue: 30,
        }),
      {
        "snowflake-sdk": {
          sql:
            'update `users` set `balance` = `balance` + ?, `times` = `times` + ?, `value` = `value` - ?, `subvalue` = `subvalue` - ? where `id` = ?',
          bindings: [10, 1, 50, 30, 1],
        }
      }
    );
  });

  it('Can clear increment/decrement calls via .clearCounter()', () => {
    testsql(
      // @ts-ignore
      qb()
        .into('users')
        .where('id', '=', 1)
        .update({ email: 'foo@bar.com' })
        .increment({
          balance: 10,
        })
        .decrement({
          value: 50,
        })
        .clearCounters(),
      {
        pg: {
          sql: 'update "users" set "email" = ? where "id" = ?',
          bindings: ['foo@bar.com', 1],
        },
        mysql: {
          sql: 'update `users` set `email` = ? where `id` = ?',
          bindings: ['foo@bar.com', 1],
        },
        mssql: {
          sql:
            'update [users] set [email] = ? where [id] = ?;select @@rowcount',
          bindings: ['foo@bar.com', 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "email" = ? where "id" = ?',
          bindings: ['foo@bar.com', 1],
        },
      }
    );
  });

  it('increment method with floats', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .increment('balance', 1.23),
      {
        mysql: {
          sql: 'update `users` set `balance` = `balance` + ? where `id` = ?',
          bindings: [1.23, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] + ? where [id] = ?;select @@rowcount',
          bindings: [1.23, 1],
        },
        pg: {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [1.23, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" + ? where "id" = ?',
          bindings: [1.23, 1],
        },
      }
    );
  });

  it('decrement method', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .decrement('balance', 10),
      {
        mysql: {
          sql: 'update `users` set `balance` = `balance` - ? where `id` = ?',
          bindings: [10, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] - ? where [id] = ?;select @@rowcount',
          bindings: [10, 1],
        },
        pg: {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [10, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [10, 1],
        },
      }
    );
  });

  it('decrement method with floats', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .decrement('balance', 1.23),
      {
        mysql: {
          sql: 'update `users` set `balance` = `balance` - ? where `id` = ?',
          bindings: [1.23, 1],
        },
        mssql: {
          sql:
            'update [users] set [balance] = [balance] - ? where [id] = ?;select @@rowcount',
          bindings: [1.23, 1],
        },
        pg: {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [1.23, 1],
        },
        'pg-redshift': {
          sql: 'update "users" set "balance" = "balance" - ? where "id" = ?',
          bindings: [1.23, 1],
        },
      }
    );
  });

  it('delete method', () => {
    testsql(
      qb()
        .from('users')
        .where('email', '=', 'foo')
        .delete(),
      {
        mysql: {
          sql: 'delete from `users` where `email` = ?',
          bindings: ['foo'],
        },
        mssql: {
          sql: 'delete from [users] where [email] = ?;select @@rowcount',
          bindings: ['foo'],
        },
        pg: {
          sql: 'delete from "users" where "email" = ?',
          bindings: ['foo'],
        },
        'pg-redshift': {
          sql: 'delete from "users" where "email" = ?',
          bindings: ['foo'],
        },
      }
    );
  });

  it('delete only method', () => {
    testsql(
      qb()
        .from('users', { only: true })
        .where('email', '=', 'foo')
        .delete(),
      {
        pg: {
          sql: 'delete from only "users" where "email" = ?',
          bindings: ['foo'],
        },
      }
    );
  });

  it('truncate method', () => {
    testsql(
      qb()
        .table('users')
        .truncate(),
      {
        mysql: {
          sql: 'truncate `users`',
          bindings: [],
        },
        sqlite3: {
          sql: 'delete from `users`',
          bindings: [],
          output: (output) => {
            expect(typeof output).toEqual('function');
          },
        },
        pg: {
          sql: 'truncate "users" restart identity',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'truncate "users"',
          bindings: [],
        },
        mssql: {
          sql: 'truncate table [users]',
          bindings: [],
        },
        oracledb: {
          sql: 'truncate table "users"',
          bindings: [],
        },
      }
    );
  });

  it('insert get id', () => {
    testsql(
      qb()
        .from('users')
        .insert({ email: 'foo' }, 'id'),
      {
        mysql: {
          sql: 'insert into `users` (`email`) values (?)',
          bindings: ['foo'],
        },
        pg: {
          sql: 'insert into "users" ("email") values (?) returning "id"',
          bindings: ['foo'],
        },
        'pg-redshift': {
          sql: 'insert into "users" ("email") values (?)',
          bindings: ['foo'],
        },
        mssql: {
          sql: 'insert into [users] ([email]) output inserted.[id] values (?)',
          bindings: ['foo'],
        },
        oracledb: {
          sql: 'insert into "users" ("email") values (?) returning "id" into ?',
          bindings: (bindings) => {
            expect(bindings.length).toEqual(2);
            expect(bindings[0]).toEqual('foo');
            expect(bindings[1].toString()).toEqual(
              '[object ReturningHelper:id]'
            );
          },
        },
      }
    );
  });

  it('wrapping', () => {
    testsql(
      qb()
        .select('*')
        .from('users'),
      {
        mysql: 'select * from `users`',
        mssql: 'select * from [users]',
        pg: 'select * from "users"',
      }
    );
  });

  it('order by desc', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy('email', 'desc'),
      {
        mysql: 'select * from `users` order by `email` desc',
        mssql: 'select * from [users] order by [email] desc',
        pg: 'select * from "users" order by "email" desc',
      }
    );
  });

  it('providing null or false as second parameter builds correctly', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('foo', null),
      {
        mysql: 'select * from `users` where `foo` is null',
        mssql: 'select * from [users] where [foo] is null',
        pg: 'select * from "users" where "foo" is null',
      }
    );
  });

  it('lock for update', () => {
    testsql(
      qb()
        .select('*')
        .from('foo')
        .where('bar', '=', 'baz')
        .forUpdate(),
      {
        mysql: {
          sql: 'select * from `foo` where `bar` = ? for update',
          bindings: ['baz'],
        },
        pg: {
          sql: 'select * from "foo" where "bar" = ? for update',
          bindings: ['baz'],
        },
        mssql: {
          sql: 'select * from [foo] with (UPDLOCK) where [bar] = ?',
          bindings: ['baz'],
        },
        oracledb: {
          sql: 'select * from "foo" where "bar" = ? for update',
          bindings: ['baz'],
        },
      }
    );
  });

  it('lock in share mode', () => {
    testsql(
      qb()
        .select('*')
        .from('foo')
        .where('bar', '=', 'baz')
        .forShare(),
      {
        mysql: {
          sql: 'select * from `foo` where `bar` = ? lock in share mode',
          bindings: ['baz'],
        },
        pg: {
          sql: 'select * from "foo" where "bar" = ? for share',
          bindings: ['baz'],
        },
        mssql: {
          sql: 'select * from [foo] with (HOLDLOCK) where [bar] = ?',
          bindings: ['baz'],
        },
      }
    );
  });

  it('should allow lock (such as forUpdate) outside of a transaction', () => {
    testsql(
      qb()
        .select('*')
        .from('foo')
        .where('bar', '=', 'baz')
        .forUpdate(),
      {
        mysql: {
          sql: 'select * from `foo` where `bar` = ? for update',
          bindings: ['baz'],
        },
        mssql: {
          sql: 'select * from [foo] with (UPDLOCK) where [bar] = ?',
          bindings: ['baz'],
        },
        pg: {
          sql: 'select * from "foo" where "bar" = ? for update',
          bindings: ['baz'],
        },
      }
    );
  });

  it('lock only some tables for update', () => {
    testsql(
      qb()
        .select('*')
        .from('foo')
        .where('bar', '=', 'baz')
        .forUpdate('lo', 'rem'),
      {
        mysql: {
          sql: 'select * from `foo` where `bar` = ? for update',
          bindings: ['baz'],
        },
        pg: {
          sql: 'select * from "foo" where "bar" = ? for update of "lo", "rem"',
          bindings: ['baz'],
        },
        mssql: {
          sql: 'select * from [foo] with (UPDLOCK) where [bar] = ?',
          bindings: ['baz'],
        },
        oracledb: {
          sql: 'select * from "foo" where "bar" = ? for update',
          bindings: ['baz'],
        },
      }
    );
  });

  it('lock for update with skip locked #1937', () => {
    testsql(
      qb()
        .select('*')
        .from('foo')
        .first()
        .forUpdate()
        .skipLocked(),
      {
        mysql: {
          sql: 'select * from `foo` limit ? for update skip locked',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "foo" limit ? for update skip locked',
          bindings: [1],
        },
      }
    );
  });

  it('lock for update with nowait #1937', () => {
    testsql(
      qb()
        .select('*')
        .from('foo')
        .first()
        .forUpdate()
        .noWait(),
      {
        mysql: {
          sql: 'select * from `foo` limit ? for update nowait',
          bindings: [1],
        },
        pg: {
          sql: 'select * from "foo" limit ? for update nowait',
          bindings: [1],
        },
      }
    );
  });

  it('noWait and skipLocked require a lock mode to be set', () => {
    expect(() => {
      qb()
        .select('*')
        .noWait()
        .toString();
    }).toThrow(
      '.noWait() can only be used after a call to .forShare() or .forUpdate()!'
    );
    expect(() => {
      qb()
        .select('*')
        .skipLocked()
        .toString();
    }).toThrow(
      '.skipLocked() can only be used after a call to .forShare() or .forUpdate()!'
    );
  });

  it('skipLocked conflicts with noWait and vice-versa', () => {
    expect(() => {
      qb()
        .select('*')
        .forUpdate()
        .noWait()
        .skipLocked()
        .toString();
    }).toThrow('.skipLocked() cannot be used together with .noWait()!');
    expect(() => {
      qb()
        .select('*')
        .forUpdate()
        .skipLocked()
        .noWait()
        .toString();
    }).toThrow('.noWait() cannot be used together with .skipLocked()!');
  });

  it('allows insert values of sub-select, #121', () => {
    testsql(
      qb()
        .table('entries')
        .insert({
          secret: 123,
          sequence: qb()
            .count('*')
            .from('entries')
            .where('secret', 123),
        }),
      {
        mysql: {
          sql:
            'insert into `entries` (`secret`, `sequence`) values (?, (select count(*) from `entries` where `secret` = ?))',
          bindings: [123, 123],
        },
        mssql: {
          sql:
            'insert into [entries] ([secret], [sequence]) values (?, (select count(*) from [entries] where [secret] = ?))',
          bindings: [123, 123],
        },
        pg: {
          sql:
            'insert into "entries" ("secret", "sequence") values (?, (select count(*) from "entries" where "secret" = ?))',
          bindings: [123, 123],
        },
        'pg-redshift': {
          sql:
            'insert into "entries" ("secret", "sequence") values (?, (select count(*) from "entries" where "secret" = ?))',
          bindings: [123, 123],
        },
      }
    );
  });

  it('allows left outer join with raw values', () => {
    testsql(
      qb()
        .select('*')
        .from('student')
        .leftOuterJoin('student_languages', function() {
          // @ts-ignore
          this.on('student.id', 'student_languages.student_id').andOn(
            'student_languages.code',
            raw('?', 'en_US')
          );
        }),
      {
        mysql: {
          sql:
            'select * from `student` left outer join `student_languages` on `student`.`id` = `student_languages`.`student_id` and `student_languages`.`code` = ?',
          bindings: ['en_US'],
        },
        mssql: {
          sql:
            'select * from [student] left outer join [student_languages] on [student].[id] = [student_languages].[student_id] and [student_languages].[code] = ?',
          bindings: ['en_US'],
        },
        pg: {
          sql:
            'select * from "student" left outer join "student_languages" on "student"."id" = "student_languages"."student_id" and "student_languages"."code" = ?',
          bindings: ['en_US'],
        },
        'pg-redshift': {
          sql:
            'select * from "student" left outer join "student_languages" on "student"."id" = "student_languages"."student_id" and "student_languages"."code" = ?',
          bindings: ['en_US'],
        },
      }
    );
  });

  it('should not break with null call #182', () => {
    testsql(
      qb()
        .from('test')
        // @ts-ignore
        .limit(null)
        .offset(null),
      {
        mysql: {
          sql: 'select * from `test`',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [test]',
          bindings: [],
        },
        pg: {
          sql: 'select * from "test"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "test"',
          bindings: [],
        },
      }
    );
  });

  it('should throw warning with null call in limit', function() {
    try {
      testsql(
        qb()
          .from('test')
          // @ts-ignore
          .limit(null),
        {
          "snowflake-sdk": {
            sql: 'select * from `test`',
            bindings: [],
          }
        },
        clientsWithCustomLoggerForTestWarnings
      );
    } catch (error) {
      expect(error.message).toEqual(
        'A valid integer must be provided to limit'
      );
    }
  });

  it('should do nothing with offset when passing null', () => {
    testsql(
      qb()
        .from('test')
        .limit(10)
        // @ts-ignore
        .offset(null),
      {
        mysql: {
          sql: 'select * from `test` limit ?',
          bindings: [10],
        },
        mssql: {
          sql: 'select top (?) * from [test]',
          bindings: [10],
        },
        pg: {
          sql: 'select * from "test" limit ?',
          bindings: [10],
        },
        'pg-redshift': {
          sql: 'select * from "test" limit ?',
          bindings: [10],
        },
      }
    );
  });

  it('should throw warning with wrong value call in offset', function() {
    try {
      testsql(
        qb()
          .from('test')
          .limit(10)
          // @ts-ignore
          .offset('$10'),
        {
          mysql: {
            sql: 'select * from `test` limit ?',
            bindings: [10],
          },
          mssql: {
            sql: 'select top (?) * from [test]',
            bindings: [10],
          },
          pg: {
            sql: 'select * from "test" limit ?',
            bindings: [10],
          },
          'pg-redshift': {
            sql: 'select * from "test" limit ?',
            bindings: [10],
          },
        },
        clientsWithCustomLoggerForTestWarnings
      );
    } catch (error) {
      expect(error.message).toEqual(
        'A valid integer must be provided to offset'
      );
    }
  });

  it('should clear offset when passing null', () => {
    testsql(
      qb()
        .from('test')
        .offset(10)
        // @ts-ignore
        .offset(null),
      {
        mysql: {
          sql: 'select * from `test`',
          bindings: [],
        },
        mssql: {
          sql: 'select * from [test]',
          bindings: [],
        },
        pg: {
          sql: 'select * from "test"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select * from "test"',
          bindings: [],
        },
      }
    );
  });

  it('allows passing builder into where clause, #162', () => {
    const chain = qb()
      .from('chapter')
      .select('id')
      .where('book', 1);
    const page = qb()
      .from('page')
      .select('id')
      .whereIn('chapter_id', chain);
    const word = qb()
      .from('word')
      .select('id')
      .whereIn('page_id', page);
    const three = chain.clone().del();
    const two = page.clone().del();
    const one = word.clone().del();

    testsql(one, {
      mysql: {
        sql:
          'delete from `word` where `page_id` in (select `id` from `page` where `chapter_id` in (select `id` from `chapter` where `book` = ?))',
        bindings: [1],
      },
      mssql: {
        sql:
          'delete from [word] where [page_id] in (select [id] from [page] where [chapter_id] in (select [id] from [chapter] where [book] = ?));select @@rowcount',
        bindings: [1],
      },
      pg: {
        sql:
          'delete from "word" where "page_id" in (select "id" from "page" where "chapter_id" in (select "id" from "chapter" where "book" = ?))',
        bindings: [1],
      },
      'pg-redshift': {
        sql:
          'delete from "word" where "page_id" in (select "id" from "page" where "chapter_id" in (select "id" from "chapter" where "book" = ?))',
        bindings: [1],
      },
    });

    testsql(two, {
      mysql: {
        sql:
          'delete from `page` where `chapter_id` in (select `id` from `chapter` where `book` = ?)',
        bindings: [1],
      },
      mssql: {
        sql:
          'delete from [page] where [chapter_id] in (select [id] from [chapter] where [book] = ?);select @@rowcount',
        bindings: [1],
      },
      pg: {
        sql:
          'delete from "page" where "chapter_id" in (select "id" from "chapter" where "book" = ?)',
        bindings: [1],
      },
      'pg-redshift': {
        sql:
          'delete from "page" where "chapter_id" in (select "id" from "chapter" where "book" = ?)',
        bindings: [1],
      },
    });

    testsql(three, {
      mysql: {
        sql: 'delete from `chapter` where `book` = ?',
        bindings: [1],
      },
      mssql: {
        sql: 'delete from [chapter] where [book] = ?;select @@rowcount',
        bindings: [1],
      },
      pg: {
        sql: 'delete from "chapter" where "book" = ?',
        bindings: [1],
      },
      'pg-redshift': {
        sql: 'delete from "chapter" where "book" = ?',
        bindings: [1],
      },
    });
  });

  it('allows specifying the columns and the query for insert, #211', () => {
    const id = 1;
    const email = 'foo@bar.com';
    testsql(
      qb()
        .into(raw('recipients (recipient_id, email)'))
        .insert(
          qb()
            .select(raw('?, ?', [id, email]))
            .whereNotExists(function() {
              // @ts-ignore
              this.select(1)
                .from('recipients')
                .where('recipient_id', id);
            })
        ),
      {
        mysql: {
          sql:
            'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from `recipients` where `recipient_id` = ?)',
          bindings: [1, 'foo@bar.com', 1],
        },
        mssql: {
          sql:
            'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from [recipients] where [recipient_id] = ?)',
          bindings: [1, 'foo@bar.com', 1],
        },
        pg: {
          sql:
            'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from "recipients" where "recipient_id" = ?)',
          bindings: [1, 'foo@bar.com', 1],
        },
        'pg-redshift': {
          sql:
            'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from "recipients" where "recipient_id" = ?)',
          bindings: [1, 'foo@bar.com', 1],
        },
      }
    );
  });

  it('does an update with join on mysql, #191', () => {
    const setObj = { 'tblPerson.City': 'Boonesville' };
    const query = qb()
      .table('tblPerson')
      .update(setObj)
      .join(
        'tblPersonData',
        'tblPersonData.PersonId',
        '=',
        'tblPerson.PersonId'
      )
      .where('tblPersonData.DataId', 1)
      .where('tblPerson.PersonId', 5);

    testsql(query, {
      mysql: {
        sql:
          'update `tblPerson` inner join `tblPersonData` on `tblPersonData`.`PersonId` = `tblPerson`.`PersonId` set `tblPerson`.`City` = ? where `tblPersonData`.`DataId` = ? and `tblPerson`.`PersonId` = ?',
        bindings: ['Boonesville', 1, 5],
      },
      mssql: {
        sql:
          'update [tblPerson] set [tblPerson].[City] = ? from [tblPerson] inner join [tblPersonData] on [tblPersonData].[PersonId] = [tblPerson].[PersonId] where [tblPersonData].[DataId] = ? and [tblPerson].[PersonId] = ?;select @@rowcount',
        bindings: ['Boonesville', 1, 5],
      },
      pg: {
        sql:
          'update "tblPerson" set "tblPerson"."City" = ? where "tblPersonData"."DataId" = ? and "tblPerson"."PersonId" = ?',
        bindings: ['Boonesville', 1, 5],
      },
      'pg-redshift': {
        sql:
          'update "tblPerson" set "tblPerson"."City" = ? where "tblPersonData"."DataId" = ? and "tblPerson"."PersonId" = ?',
        bindings: ['Boonesville', 1, 5],
      },
    });
  });

  it('does crazy advanced inserts with clever raw use, #211', () => {
    const q1 = qb()
      // @ts-ignore
      .select(raw("'user'"), raw("'user@foo.com'"))
      .whereNotExists(function() {
        // @ts-ignore
        this.select(1)
          .from('recipients')
          .where('recipient_id', 1);
      });
    const q2 = qb()
      .table('recipients')
      .insert(raw('(recipient_id, email) ?', [q1]));

    testsql(q2, {
      // mysql: {
      //   sql: 'insert into `recipients` (recipient_id, email) select \'user\', \'user@foo.com\' where not exists (select 1 from `recipients` where `recipient_id` = ?)',
      //   bindings: [1]
      // },
      // mssql: {
      //   sql: 'insert into [recipients] (recipient_id, email) select \'user\', \'user@foo.com\' where not exists (select 1 from [recipients] where [recipient_id] = ?)',
      //   bindings: [1]
      // },
      pg: {
        sql:
          'insert into "recipients" (recipient_id, email) (select \'user\', \'user@foo.com\' where not exists (select 1 from "recipients" where "recipient_id" = ?))',
        bindings: [1],
      },
      'pg-redshift': {
        sql:
          'insert into "recipients" (recipient_id, email) (select \'user\', \'user@foo.com\' where not exists (select 1 from "recipients" where "recipient_id" = ?))',
        bindings: [1],
      },
    });
  });

  it('supports capitalized operators', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', 'LIKE', '%test%'),
      {
        mysql: {
          sql: 'select * from `users` where `name` like ?',
          bindings: ['%test%'],
        },
        mssql: {
          sql: 'select * from [users] where [name] like ?',
          bindings: ['%test%'],
        },
        pg: {
          sql: 'select * from "users" where "name" like ?',
          bindings: ['%test%'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "name" like ?',
          bindings: ['%test%'],
        },
      }
    );
  });

  it('supports POSIX regex operators in Postgres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', '~', '.*test.*'),
      {
        pg: {
          sql: 'select * from "users" where "name" ~ ?',
          bindings: ['.*test.*'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "name" ~ ?',
          bindings: ['.*test.*'],
        },
      }
    );
  });

  it('supports NOT ILIKE operator in Postgres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', 'not ilike', '%jeff%'),
      {
        pg: {
          sql: 'select * from "users" where "name" not ilike ?',
          bindings: ['%jeff%'],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "name" not ilike ?',
          bindings: ['%jeff%'],
        },
      }
    );
  });

  it('throws if you try to use an invalid operator', () => {
    expect(() => {
      qb()
        .select('*')
        .where('id', 'isnt', 1)
        .toString();
    }).toThrow('The operator "isnt" is not permitted');
  });

  it('throws if you try to use an invalid operator in an inserted statement', () => {
    const obj = qb()
      .select('*')
      .where('id', 'isnt', 1);
    expect(() => {
      qb()
        .select('*')
        .from('users')
        .where('id', 'in', obj)
        .toString();
    }).toThrow('The operator "isnt" is not permitted');
  });

  it('#287 - wraps correctly for arrays', () => {
    // arrays only work for postgres
    testsql(
      qb()
        .select('*')
        .from('value')
        .join('table', 'table.array_column[1]', '=', raw('?', 1)),
      {
        mysql: {
          sql:
            'select * from `value` inner join `table` on `table`.`array_column[1]` = ?',
          bindings: [1],
        },
        pg: {
          sql:
            'select * from "value" inner join "table" on "table"."array_column"[1] = ?',
          bindings: [1],
        },
        'pg-redshift': {
          sql:
            'select * from "value" inner join "table" on "table"."array_column"[1] = ?',
          bindings: [1],
        },
      }
    );
  });

  it('allows wrap on raw to wrap in parens and alias', () => {
    testsql(
      qb()
        .select(
          'e.lastname',
          'e.salary',
          raw(
            qb()
              .select('avg(salary)')
              .from('employee')
              .whereRaw('dept_no = e.dept_no')
          ).wrap('(', ') avg_sal_dept')
        )
        .from('employee as e')
        .where('dept_no', '=', 'e.dept_no'),
      {
        "snowflake-sdk": {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) avg_sal_dept from "employee" as "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        }
      }
    );
  });

  it('allows select as syntax', () => {
    testsql(
      qb()
        .select(
          'e.lastname',
          'e.salary',
          qb()
            .select('avg(salary)')
            .from('employee')
            .whereRaw('dept_no = e.dept_no')
            .as('avg_sal_dept')
        )
        .from('employee as e')
        .where('dept_no', '=', 'e.dept_no'),
      {
        mysql: {
          sql:
            'select `e`.`lastname`, `e`.`salary`, (select `avg(salary)` from `employee` where dept_no = e.dept_no) as `avg_sal_dept` from `employee` as `e` where `dept_no` = ?',
          bindings: ['e.dept_no'],
        },
        mssql: {
          sql:
            'select [e].[lastname], [e].[salary], (select [avg(salary)] from [employee] where dept_no = e.dept_no) as [avg_sal_dept] from [employee] as [e] where [dept_no] = ?',
          bindings: ['e.dept_no'],
        },
        oracledb: {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) "avg_sal_dept" from "employee" "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        },
        pg: {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) as "avg_sal_dept" from "employee" as "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        },
        'pg-redshift': {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) as "avg_sal_dept" from "employee" as "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        },
      }
    );
  });

  it('allows function for subselect column', () => {
    testsql(
      qb()
        .select('e.lastname', 'e.salary')
        .select(function() {
          // @ts-ignore
          this.select('avg(salary)')
            .from('employee')
            .whereRaw('dept_no = e.dept_no')
            .as('avg_sal_dept');
        })
        .from('employee as e')
        .where('dept_no', '=', 'e.dept_no'),
      {
        mysql: {
          sql:
            'select `e`.`lastname`, `e`.`salary`, (select `avg(salary)` from `employee` where dept_no = e.dept_no) as `avg_sal_dept` from `employee` as `e` where `dept_no` = ?',
          bindings: ['e.dept_no'],
        },
        mssql: {
          sql:
            'select [e].[lastname], [e].[salary], (select [avg(salary)] from [employee] where dept_no = e.dept_no) as [avg_sal_dept] from [employee] as [e] where [dept_no] = ?',
          bindings: ['e.dept_no'],
        },
        oracledb: {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) "avg_sal_dept" from "employee" "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        },
        pg: {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) as "avg_sal_dept" from "employee" as "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        },
        'pg-redshift': {
          sql:
            'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) as "avg_sal_dept" from "employee" as "e" where "dept_no" = ?',
          bindings: ['e.dept_no'],
        },
      }
    );
  });

  it('allows first as syntax', () => {
    testsql(
      qb()
        .select(
          'e.lastname',
          'e.salary',
          qb()
            .first('salary')
            .from('employee')
            .whereRaw('dept_no = e.dept_no')
            .orderBy('salary', 'desc')
            .as('top_dept_salary')
        )
        .from('employee as e')
        .where('dept_no', '=', 'e.dept_no'),
      {
        mysql: {
          sql:
            'select `e`.`lastname`, `e`.`salary`, (select `salary` from `employee` where dept_no = e.dept_no order by `salary` desc limit ?) as `top_dept_salary` from `employee` as `e` where `dept_no` = ?',
          bindings: [1, 'e.dept_no'],
        },
        mssql: {
          sql:
            'select [e].[lastname], [e].[salary], (select top (?) [salary] from [employee] where dept_no = e.dept_no order by [salary] desc) as [top_dept_salary] from [employee] as [e] where [dept_no] = ?',
          bindings: [1, 'e.dept_no'],
        },
        pg: {
          sql:
            'select "e"."lastname", "e"."salary", (select "salary" from "employee" where dept_no = e.dept_no order by "salary" desc limit ?) as "top_dept_salary" from "employee" as "e" where "dept_no" = ?',
          bindings: [1, 'e.dept_no'],
        },
        'pg-redshift': {
          sql:
            'select "e"."lastname", "e"."salary", (select "salary" from "employee" where dept_no = e.dept_no order by "salary" desc limit ?) as "top_dept_salary" from "employee" as "e" where "dept_no" = ?',
          bindings: [1, 'e.dept_no'],
        },
      }
    );
  });

  it('supports arbitrarily nested raws', () => {
    const chain = qb()
      .select('*')
      .from('places')
      .where(
        raw(
          'ST_DWithin((places.address).xy, ?, ?) AND ST_Distance((places.address).xy, ?) > ? AND ?',
          [
            raw('ST_SetSRID(?,?)', [raw('ST_MakePoint(?,?)', [-10, 10]), 4326]),
            100000,
            raw('ST_SetSRID(?,?)', [raw('ST_MakePoint(?,?)', [-5, 5]), 4326]),
            50000,
            raw('places.id IN ?', [[1, 2, 3]]),
          ]
        )
      );

    testsql(chain, {
      mysql: {
        sql:
          'select * from `places` where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1, 2, 3]],
      },
      mssql: {
        sql:
          'select * from [places] where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1, 2, 3]],
      },
      pg: {
        sql:
          'select * from "places" where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1, 2, 3]],
      },
      'pg-redshift': {
        sql:
          'select * from "places" where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1, 2, 3]],
      },
    });
  });

  it('has joinRaw for arbitrary join clauses', () => {
    testsql(
      qb()
        .select('*')
        .from('accounts')
        .joinRaw('natural full join table1')
        .where('id', 1),
      {
        mysql: {
          sql:
            'select * from `accounts` natural full join table1 where `id` = ?',
          bindings: [1],
        },
        mssql: {
          sql:
            'select * from [accounts] natural full join table1 where [id] = ?',
          bindings: [1],
        },
        pg: {
          sql:
            'select * from "accounts" natural full join table1 where "id" = ?',
          bindings: [1],
        },
        'pg-redshift': {
          sql:
            'select * from "accounts" natural full join table1 where "id" = ?',
          bindings: [1],
        },
      }
    );
  });

  it('allows a raw query in the second param', () => {
    testsql(
      qb()
        .select('*')
        .from('accounts')
        .innerJoin(
          'table1',
          raw(
            'ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))'
          )
        ),
      {
        mysql: {
          sql:
            'select * from `accounts` inner join `table1` on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))',
        },
        mssql: {
          sql:
            'select * from [accounts] inner join [table1] on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))',
        },
        pg: {
          sql:
            'select * from "accounts" inner join "table1" on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))',
        },
        'pg-redshift': {
          sql:
            'select * from "accounts" inner join "table1" on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))',
        },
      }
    );
  });

  it('allows join "using"', () => {
    testsql(
      qb()
        .select('*')
        .from('accounts')
        .innerJoin('table1', function() {
          // @ts-ignore
          this.using('id');
        }),
      {
        mysql: {
          sql: 'select * from `accounts` inner join `table1` using (`id`)',
        },
        mssql: {
          //sql: 'select * from [accounts] inner join [table1] on [accounts].[id] = [table1].[id]'
          sql: 'select * from [accounts] inner join [table1] using ([id])',
        },
        pg: {
          sql: 'select * from "accounts" inner join "table1" using ("id")',
        },
        'pg-redshift': {
          sql: 'select * from "accounts" inner join "table1" using ("id")',
        },
      }
    );

    testsql(
      qb()
        .select('*')
        .from('accounts')
        .innerJoin('table1', function() {
          // @ts-ignore
          this.using(['id', 'test']);
        }),
      {
        mysql: {
          sql:
            'select * from `accounts` inner join `table1` using (`id`, `test`)',
        },
        mssql: {
          //sql: 'select * from [accounts] inner join [table1] on [accounts].[id] = [table1].[id]'
          sql:
            'select * from [accounts] inner join [table1] using ([id], [test])',
        },
        pg: {
          sql:
            'select * from "accounts" inner join "table1" using ("id", "test")',
        },
        'pg-redshift': {
          sql:
            'select * from "accounts" inner join "table1" using ("id", "test")',
        },
      }
    );
  });

  it('allows sub-query function on insert, #427', () => {
    testsql(
      qb()
        .into('votes')
        .insert(function() {
          // @ts-ignore
          this.select('*')
            .from('votes')
            .where('id', 99);
        }),
      {
        mysql: {
          sql: 'insert into `votes` select * from `votes` where `id` = ?',
          bindings: [99],
        },
        mssql: {
          sql: 'insert into [votes] select * from [votes] where [id] = ?',
          bindings: [99],
        },
        pg: {
          sql: 'insert into "votes" select * from "votes" where "id" = ?',
          bindings: [99],
        },
        'pg-redshift': {
          sql: 'insert into "votes" select * from "votes" where "id" = ?',
          bindings: [99],
        },
      }
    );
  });

  it('allows sub-query chain on insert, #427', () => {
    testsql(
      qb()
        .into('votes')
        .insert(
          qb()
            .select('*')
            .from('votes')
            .where('id', 99)
        ),
      {
        mysql: {
          sql: 'insert into `votes` select * from `votes` where `id` = ?',
          bindings: [99],
        },
        mssql: {
          sql: 'insert into [votes] select * from [votes] where [id] = ?',
          bindings: [99],
        },
        oracledb: {
          sql: 'insert into "votes" select * from "votes" where "id" = ?',
          bindings: [99],
        },
        pg: {
          sql: 'insert into "votes" select * from "votes" where "id" = ?',
          bindings: [99],
        },
        'pg-redshift': {
          sql: 'insert into "votes" select * from "votes" where "id" = ?',
          bindings: [99],
        },
      }
    );
  });

  it('allows for raw values in join, #441', () => {
    testsql(
      qb()
        .select('A.nid AS id')
        .from(raw('nidmap2 AS A'))
        .innerJoin(
          raw(
            ['SELECT MIN(nid) AS location_id', 'FROM nidmap2'].join(' ')
          ).wrap('(', ') AS B'),
          'A.x',
          '=',
          'B.x'
        ),
      {
        mysql: {
          sql:
            'select `A`.`nid` as `id` from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on `A`.`x` = `B`.`x`',
          bindings: [],
        },
        mssql: {
          sql:
            'select [A].[nid] as [id] from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on [A].[x] = [B].[x]',
          bindings: [],
        },
        oracledb: {
          sql:
            'select "A"."nid" "id" from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on "A"."x" = "B"."x"',
          bindings: [],
        },
        pg: {
          sql:
            'select "A"."nid" as "id" from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on "A"."x" = "B"."x"',
          bindings: [],
        },
        'pg-redshift': {
          sql:
            'select "A"."nid" as "id" from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on "A"."x" = "B"."x"',
          bindings: [],
        },
      }
    );
  });

  it('allows insert values of sub-select without raw, #627', () => {
    testsql(
      qb()
        .table('entries')
        .insert({
          secret: 123,
          sequence: qb()
            .count('*')
            .from('entries')
            .where('secret', 123),
        }),
      {
        mysql: {
          sql:
            'insert into `entries` (`secret`, `sequence`) values (?, (select count(*) from `entries` where `secret` = ?))',
          bindings: [123, 123],
        },
        mssql: {
          sql:
            'insert into [entries] ([secret], [sequence]) values (?, (select count(*) from [entries] where [secret] = ?))',
          bindings: [123, 123],
        },
        pg: {
          sql:
            'insert into "entries" ("secret", "sequence") values (?, (select count(*) from "entries" where "secret" = ?))',
          bindings: [123, 123],
        },
        'pg-redshift': {
          sql:
            'insert into "entries" ("secret", "sequence") values (?, (select count(*) from "entries" where "secret" = ?))',
          bindings: [123, 123],
        },
      }
    );
  });

  it('should always wrap subquery with parenthesis', () => {
    const subquery = qb().select(raw('?', ['inner raw select']), 'bar');
    testsql(
      qb()
        .select(raw('?', ['outer raw select']))
        .from(subquery),
      {
        mysql: {
          sql: 'select ? from (select ?, `bar`)',
          bindings: ['outer raw select', 'inner raw select'],
        },
        mssql: {
          sql: 'select ? from (select ?, [bar])',
          bindings: ['outer raw select', 'inner raw select'],
        },
        oracledb: {
          sql: 'select ? from (select ?, "bar")',
          bindings: ['outer raw select', 'inner raw select'],
        },
        pg: {
          sql: 'select ? from (select ?, "bar")',
          bindings: ['outer raw select', 'inner raw select'],
        },
        'pg-redshift': {
          sql: 'select ? from (select ?, "bar")',
          bindings: ['outer raw select', 'inner raw select'],
        },
      }
    );
  });

  it('correctly orders parameters when selecting from subqueries, #704', () => {
    const subquery = qb()
      .select(raw('? as f', ['inner raw select']))
      .as('g');
    testsql(
      qb()
        .select(raw('?', ['outer raw select']), 'g.f')
        .from(subquery)
        .where('g.secret', 123),
      {
        mysql: {
          sql:
            'select ?, `g`.`f` from (select ? as f) as `g` where `g`.`secret` = ?',
          bindings: ['outer raw select', 'inner raw select', 123],
        },
        mssql: {
          sql:
            'select ?, [g].[f] from (select ? as f) as [g] where [g].[secret] = ?',
          bindings: ['outer raw select', 'inner raw select', 123],
        },
        oracledb: {
          sql:
            'select ?, "g"."f" from (select ? as f) "g" where "g"."secret" = ?',
          bindings: ['outer raw select', 'inner raw select', 123],
        },
        pg: {
          sql:
            'select ?, "g"."f" from (select ? as f) as "g" where "g"."secret" = ?',
          bindings: ['outer raw select', 'inner raw select', 123],
        },
        'pg-redshift': {
          sql:
            'select ?, "g"."f" from (select ? as f) as "g" where "g"."secret" = ?',
          bindings: ['outer raw select', 'inner raw select', 123],
        },
      }
    );
  });

  it('escapes queries properly, #737', () => {
    testsql(
      qb()
        .select('id","name', 'id`name')
        .from('test`'),
      {
        mysql: {
          sql: 'select `id","name`, `id``name` from `test```',
          bindings: [],
        },
        mssql: {
          sql: 'select [id","name], [id`name] from [test`]',
          bindings: [],
        },
        pg: {
          sql: 'select "id"",""name", "id`name" from "test`"',
          bindings: [],
        },
        'pg-redshift': {
          sql: 'select "id"",""name", "id`name" from "test`"',
          bindings: [],
        },
      }
    );
  });

  it('has a modify method which accepts a function that can modify the query', () => {
    // arbitrary number of arguments can be passed to `.modify(queryBuilder, ...)`,
    // builder is bound to `this`
    const withBars = function(queryBuilder, table, fk) {
      // @ts-ignore
      if (!this || this !== queryBuilder) {
        throw 'Expected query builder passed as first argument and bound as `this` context';
      }
      // @ts-ignore
      this.leftJoin('bars', table + '.' + fk, 'bars.id').select('bars.*');
    };

    testsql(
      qb()
        .select('foo_id')
        .from('foos')
        .modify(withBars, 'foos', 'bar_id'),
      {
        mysql: {
          sql:
            'select `foo_id`, `bars`.* from `foos` left join `bars` on `foos`.`bar_id` = `bars`.`id`',
        },
        mssql: {
          sql:
            'select [foo_id], [bars].* from [foos] left join [bars] on [foos].[bar_id] = [bars].[id]',
        },
        pg: {
          sql:
            'select "foo_id", "bars".* from "foos" left join "bars" on "foos"."bar_id" = "bars"."id"',
        },
        'pg-redshift': {
          sql:
            'select "foo_id", "bars".* from "foos" left join "bars" on "foos"."bar_id" = "bars"."id"',
        },
      }
    );
  });

  it('Allows for empty where #749', () => {
    testsql(
      qb()
        .select('foo')
        .from('tbl')
        .where(() => {}),
      {
        mysql: 'select `foo` from `tbl`',
        mssql: 'select [foo] from [tbl]',
        pg: 'select "foo" from "tbl"',
      }
    );
  });

  it('escapes single quotes properly', () => {
    testquery(
      qb()
        .select('*')
        .from('users')
        .where('last_name', "O'Brien"),
      {
        mysql: "select * from `users` where `last_name` = 'O\\'Brien'",
        pg: 'select * from "users" where "last_name" = \'O\'\'Brien\'',
      }
    );
  });

  it('escapes double quotes property', () => {
    testquery(
      qb()
        .select('*')
        .from('players')
        .where('name', 'Gerald "Ice" Williams'),
      {
        pg: 'select * from "players" where "name" = \'Gerald "Ice" Williams\'',
      }
    );
  });

  it('escapes backslashes properly', () => {
    testquery(
      qb()
        .select('*')
        .from('files')
        .where('path', 'C:\\test.txt'),
      {
        pg: 'select * from "files" where "path" = E\'C:\\\\test.txt\'',
      }
    );
  });

  it('allows join without operator and with value 0 #953', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        // @ts-ignore
        .join('photos', 'photos.id', 0),
      {
        mysql: {
          sql: 'select * from `users` inner join `photos` on `photos`.`id` = 0',
        },
        mssql: {
          sql: 'select * from [users] inner join [photos] on [photos].[id] = 0',
        },
        pg: {
          sql: 'select * from "users" inner join "photos" on "photos"."id" = 0',
        },
        'pg-redshift': {
          sql: 'select * from "users" inner join "photos" on "photos"."id" = 0',
        },
      }
    );
  });

  it('allows join with operator and with value 0 #953', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        // @ts-ignore
        .join('photos', 'photos.id', '>', 0),
      {
        mysql: {
          sql: 'select * from `users` inner join `photos` on `photos`.`id` > 0',
        },
        mssql: {
          sql: 'select * from [users] inner join [photos] on [photos].[id] > 0',
        },
        pg: {
          sql: 'select * from "users" inner join "photos" on "photos"."id" > 0',
        },
        'pg-redshift': {
          sql: 'select * from "users" inner join "photos" on "photos"."id" > 0',
        },
      }
    );
  });

  it('where with date object', () => {
    const date = new Date();
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('birthday', '>=', date),
      {
        mysql: {
          sql: 'select * from `users` where `birthday` >= ?',
          bindings: [date],
        },
        mssql: {
          sql: 'select * from [users] where [birthday] >= ?',
          bindings: [date],
        },
        pg: {
          sql: 'select * from "users" where "birthday" >= ?',
          bindings: [date],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "birthday" >= ?',
          bindings: [date],
        },
      }
    );
  });

  it('raw where with date object', () => {
    const date = new Date();
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereRaw('birthday >= ?', date),
      {
        mysql: {
          sql: 'select * from `users` where birthday >= ?',
          bindings: [date],
        },
        mssql: {
          sql: 'select * from [users] where birthday >= ?',
          bindings: [date],
        },
        pg: {
          sql: 'select * from "users" where birthday >= ?',
          bindings: [date],
        },
        'pg-redshift': {
          sql: 'select * from "users" where birthday >= ?',
          bindings: [date],
        },
      }
    );
  });

  it('#965 - .raw accepts Array and Non-Array bindings', () => {
    const expected = (fieldName, expectedBindings) => ({
      mysql: {
        sql: 'select * from `users` where ' + fieldName + ' = ?',
        bindings: expectedBindings,
      },
      mssql: {
        sql: 'select * from [users] where ' + fieldName + ' = ?',
        bindings: expectedBindings,
      },
      pg: {
        sql: 'select * from "users" where ' + fieldName + ' = ?',
        bindings: expectedBindings,
      },
      'pg-redshift': {
        sql: 'select * from "users" where ' + fieldName + ' = ?',
        bindings: expectedBindings,
      },
    });

    //String
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('username = ?', 'knex')),
      expected('username', ['knex'])
    );
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('username = ?', ['knex'])),
      expected('username', ['knex'])
    );

    //Number
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('isadmin = ?', 0)),
      expected('isadmin', [0])
    );
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('isadmin = ?', [1])),
      expected('isadmin', [1])
    );

    //Date
    const date = new Date(2016, 0, 5, 10, 19, 30, 599);
    const sqlUpdTime = '2016-01-05 10:19:30.599';
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('updtime = ?', date)),
      expected('updtime', [date])
    );
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('updtime = ?', [date])),
      expected('updtime', [date])
    );
    testquery(
      qb()
        .select('*')
        .from('users')
        .where(raw('updtime = ?', date)),
      {
        mysql: "select * from `users` where updtime = '" + sqlUpdTime + "'",
        pg: 'select * from "users" where updtime = \'' + sqlUpdTime + "'",
      }
    );
  });

  it('#1118 orWhere({..}) generates or (and - and - and)', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhere({
          email: 'foo',
          id: 2,
        }),
      {
        mysql: {
          sql:
            'select * from `users` where `id` = ? or (`email` = ? and `id` = ?)',
          bindings: [1, 'foo', 2],
        },
        mssql: {
          sql:
            'select * from [users] where [id] = ? or ([email] = ? and [id] = ?)',
          bindings: [1, 'foo', 2],
        },
        pg: {
          sql:
            'select * from "users" where "id" = ? or ("email" = ? and "id" = ?)',
          bindings: [1, 'foo', 2],
        },
        'pg-redshift': {
          sql:
            'select * from "users" where "id" = ? or ("email" = ? and "id" = ?)',
          bindings: [1, 'foo', 2],
        },
      }
    );
  });

  it('#1228 Named bindings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('id', raw('select (:test)', { test: [1, 2, 3] })),
      {
        mysql: {
          sql: 'select * from `users` where `id` in (select (?))',
          bindings: [[1, 2, 3]],
        },
        mssql: {
          sql: 'select * from [users] where [id] in (select (?))',
          bindings: [[1, 2, 3]],
        },
        pg: {
          sql: 'select * from "users" where "id" in (select (?))',
          bindings: [[1, 2, 3]],
        },
        'pg-redshift': {
          sql: 'select * from "users" where "id" in (select (?))',
          bindings: [[1, 2, 3]],
        },
      }
    );

    const namedBindings = {
      name: 'users.name',
      thisGuy: 'Bob',
      otherGuy: 'Jay',
    };
    //Had to do it this way as the 'raw' statement's .toQuery is called before testsql, meaning mssql and other dialects would always get the output of qb() default client
    //as MySQL, which means testing the query per dialect won't work. [users].[name] would be `users`.`name` for mssql which is incorrect.
    const snowflake = clients["snowflake-sdk"];

    const snowflakeQb = snowflake
      .queryBuilder()
      .select('*')
      .from('users')
      .where(
        snowflake.raw(':name: = :thisGuy or :name: = :otherGuy', namedBindings)
      )
      .toSQL();

    expect(snowflakeQb.sql).toEqual(
      'select * from [users] where [users].[name] = ? or [users].[name] = ?'
    );
    expect(snowflakeQb.bindings).toEqual(['Bob', 'Jay']);
  });

  it('#1268 - valueForUndefined should be in toSQL(QueryCompiler)', () => {
    testsql(
      qb()
        .insert([
          {id: void 0, name: 'test', occupation: void 0},
          {id: 1, name: void 0, occupation: 'none'},
        ])
        .into('users'),
      {
        mysql: {
          sql:
            'insert into `users` (`id`, `name`, `occupation`) values (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
          bindings: ['test', 1, 'none'],
        },
        oracledb: {
          sql:
            'begin execute immediate \'insert into "users" ("id", "name", "occupation") values (DEFAULT, :1, DEFAULT)\' using ?; execute immediate \'insert into "users" ("id", "name", "occupation") values (:1, DEFAULT, :2)\' using ?, ?;end;',
          bindings: ['test', 1, 'none'],
        },
        mssql: {
          sql:
            'insert into [users] ([id], [name], [occupation]) values (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
          bindings: ['test', 1, 'none'],
        },
        pg: {
          sql:
            'insert into "users" ("id", "name", "occupation") values (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
          bindings: ['test', 1, 'none'],
        },
        'pg-redshift': {
          sql:
            'insert into "users" ("id", "name", "occupation") values (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
          bindings: ['test', 1, 'none'],
        },
      }
    );

    it('#1402 - raw should take "not" into consideration in querybuilder', () => {
      testsql(
        qb()
          .from('testtable')
          .whereNot(raw('is_active')),
        {
          "snowflake-sdk": {
            sql: 'select * from `testtable` where not is_active',
            bindings: [],
          }
        }
      );
    });

    it('Any undefined binding in a SELECT query should throw an error', () => {
      const qbuilders = [
        {
          builder: qb()
            .from('accounts')
            .where({Login: void 0})
            .select(),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            // @ts-ignore
            .where('Login', void 0)
            .select(),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            // @ts-ignore
            .where('Login', '>=', void 0)
            .select(),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            // @ts-ignore
            .whereIn('Login', ['test', 'val', void 0])
            .select(),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            .where({Login: ['1', '2', '3', void 0]}),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            .where({Login: {Test: '123', Value: void 0}}),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            .where({Login: ['1', ['2', [void 0]]]}),
          undefinedColumns: ['Login'],
        },
        {
          builder: qb()
            .from('accounts')
            .update({test: '1', test2: void 0})
            .where({abc: 'test', cba: void 0}),
          undefinedColumns: ['cba'],
        },
      ];
      qbuilders.forEach(({builder, undefinedColumns}) => {
        try {
          //Must be present, but makes no difference since it throws.
          testsql(builder, {
            mysql: {
              sql: '',
              bindings: [],
            },
            oracledb: {
              sql: '',
              bindings: [],
            },
            mssql: {
              sql: '',
              bindings: [],
            },
            pg: {
              sql: '',
              bindings: [],
            },
            'pg-redshift': {
              sql: '',
              bindings: [],
            },
          });
          expect(true).toEqual(
            false,
            // @ts-ignore
            'Expected toThrow error in compilation about undefined bindings.'
          );
        } catch (error) {
          expect(error.message).toContain(
            'Undefined binding(s) detected when compiling ' +
            builder._method.toUpperCase() +
            `. Undefined column(s): [${undefinedColumns.join(', ')}] query:`
          ); //This test is not for asserting correct queries
        }
      });
    });

    it('Any undefined binding in a RAW query should throw an error', () => {
      const raws = [
        {query: raw('?', [undefined]), undefinedIndices: [0]},
        {
          query: raw(':col = :value', {col: 'test', value: void 0}),
          undefinedIndices: ['value'],
        },
        {query: raw('? = ?', ['test', void 0]), undefinedIndices: [1]},
        {
          query: raw('? = ?', ['test', {test: void 0}]),
          undefinedIndices: [1],
        },
        {query: raw('?', [['test', void 0]]), undefinedIndices: [0]},
      ];
      raws.forEach(({query, undefinedIndices}) => {
        try {
          query.toSQL();
          expect(true).toEqual(
            false,
            // @ts-ignore
            'Expected toThrow error in compilation about undefined bindings.'
          );
        } catch (error) {
          const expectedErrorMessageContains = `Undefined binding(s) detected for keys [${undefinedIndices.join(
            ', '
          )}] when compiling RAW query:`;
          expect(error.message).toContain(expectedErrorMessageContains); //This test is not for asserting correct queries
        }
      });
    });

    it('Support escaping of named bindings', () => {
      const namedBindings = {a: 'foo', b: 'bar', c: 'baz'};

      const raws = [
        [
          raw(':a: = :b OR :c', namedBindings),
          '"foo" = ? OR ?',
          [namedBindings.b, namedBindings.c],
        ],
        [
          raw(':a: = \\:b OR :c', namedBindings),
          '"foo" = :b OR ?',
          [namedBindings.c],
        ],
        [
          raw('\\:a: = :b OR :c', namedBindings),
          ':a: = ? OR ?',
          [namedBindings.b, namedBindings.c],
        ],
        [raw(':a: = \\:b OR \\:c', namedBindings), '"foo" = :b OR :c', []],
        [raw('\\:a: = \\:b OR \\:c', namedBindings), ':a: = :b OR :c', []],
      ];

      raws.forEach((raw) => {
        const result = raw[0].toSQL();
        expect(result.sql).toEqual(raw[1]);
        expect(result.bindings).toEqual(raw[2]);
      });
    });

    it('Respect casting with named bindings', () => {
      const namedBindings = {a: 'foo', b: 'bar', c: 'baz'};

      const raws = [
        [
          raw(':a: = :b::TEXT OR :c', namedBindings),
          '"foo" = ?::TEXT OR ?',
          [namedBindings.b, namedBindings.c],
        ],
        [
          raw(':a: = :b::TEXT OR :c::TEXT', namedBindings),
          '"foo" = ?::TEXT OR ?::TEXT',
          [namedBindings.b, namedBindings.c],
        ],
        [
          raw(":a: = 'bar'::TEXT OR :b OR :c::TEXT", namedBindings),
          '"foo" = \'bar\'::TEXT OR ? OR ?::TEXT',
          [namedBindings.b, namedBindings.c],
        ],
        [
          raw(':a:::TEXT = OR :b::TEXT OR :c', namedBindings),
          '"foo"::TEXT = OR ?::TEXT OR ?',
          [namedBindings.b, namedBindings.c],
        ],
        [
          raw('\\:a: = :b::TEXT OR :c', namedBindings),
          ':a: = ?::TEXT OR ?',
          [namedBindings.b, namedBindings.c],
        ],
        [
          raw(':a: = \\:b::TEXT OR \\:c', namedBindings),
          '"foo" = :b::TEXT OR :c',
          [],
        ],
        [
          raw('\\:a: = \\:b::TEXT OR \\:c', namedBindings),
          ':a: = :b::TEXT OR :c',
          [],
        ],
      ];

      raws.forEach((raw) => {
        const result = raw[0].toSQL();
        expect(result.sql).toEqual(raw[1]);
        expect(result.bindings).toEqual(raw[2]);
      });
    });

    it('query \\\\? escaping', () => {
      testquery(
        qb()
          .select('*')
          .from('users')
          .where('id', '=', 1)
          .whereRaw('?? \\? ?', ['jsonColumn', 'jsonKey?']),
        {
          mysql:
            "select * from `users` where `id` = 1 and `jsonColumn` ? 'jsonKey?'",
          pg:
            'select * from "users" where "id" = 1 and "jsonColumn" ? \'jsonKey?\'',
        }
      );
    });

    it('operator transformation', () => {
      // part of common base code, no need to test on every dialect
      testsql(
        qb()
          .select('*')
          .from('users')
          .where('id', '?', 1),
        {
          pg: 'select * from "users" where "id" \\? ?',
        }
      );
      testsql(
        qb()
          .select('*')
          .from('users')
          .where('id', '?|', 1),
        {
          pg: 'select * from "users" where "id" \\?| ?',
        }
      );
      testsql(
        qb()
          .select('*')
          .from('users')
          .where('id', '?&', 1),
        {
          pg: 'select * from "users" where "id" \\?& ?',
        }
      );
    });

    it("wrapped 'with' clause select", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.select('foo').from('users');
          })
          .select('*')
          .from('withClause'),
        {
          mssql:
            'with [withClause] as (select [foo] from [users]) select * from [withClause]',
          sqlite3:
            'with `withClause` as (select `foo` from `users`) select * from `withClause`',
          pg:
            'with "withClause" as (select "foo" from "users") select * from "withClause"',
          'pg-redshift':
            'with "withClause" as (select "foo" from "users") select * from "withClause"',
          oracledb:
            'with "withClause" as (select "foo" from "users") select * from "withClause"',
        }
      );
    });

    it("wrapped 'with' clause insert", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.select('foo').from('users');
          })
          .insert(raw('select * from "withClause"'))
          .into('users'),
        {
          "snowflake-sdk":
            'with [withClause] as (select [foo] from [users]) insert into [users] select * from "withClause"'
        }
      );
    });

    it("wrapped 'with' clause multiple insert", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.select('foo')
              .from('users')
              .where({name: 'bob'});
          })
          .insert([
            {email: 'thisMail', name: 'sam'},
            {email: 'thatMail', name: 'jack'},
          ])
          .into('users'),
        {
          mssql: {
            sql:
              'with [withClause] as (select [foo] from [users] where [name] = ?) insert into [users] ([email], [name]) values (?, ?), (?, ?)',
            bindings: ['bob', 'thisMail', 'sam', 'thatMail', 'jack'],
          },
          sqlite3: {
            sql:
              'with `withClause` as (select `foo` from `users` where `name` = ?) insert into `users` (`email`, `name`) select ? as `email`, ? as `name` union all select ? as `email`, ? as `name`',
            bindings: ['bob', 'thisMail', 'sam', 'thatMail', 'jack'],
          },
          pg: {
            sql:
              'with "withClause" as (select "foo" from "users" where "name" = ?) insert into "users" ("email", "name") values (?, ?), (?, ?)',
            bindings: ['bob', 'thisMail', 'sam', 'thatMail', 'jack'],
          },
          'pg-redshift': {
            sql:
              'with "withClause" as (select "foo" from "users" where "name" = ?) insert into "users" ("email", "name") values (?, ?), (?, ?)',
            bindings: ['bob', 'thisMail', 'sam', 'thatMail', 'jack'],
          },
        }
      );
    });

    it("wrapped 'with' clause update", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.select('foo').from('users');
          })
          .update({foo: 'updatedFoo'})
          .where('email', '=', 'foo')
          .from('users'),
        {
          mssql:
            'with [withClause] as (select [foo] from [users]) update [users] set [foo] = ? where [email] = ?;select @@rowcount',
          sqlite3:
            'with `withClause` as (select `foo` from `users`) update `users` set `foo` = ? where `email` = ?',
          pg:
            'with "withClause" as (select "foo" from "users") update "users" set "foo" = ? where "email" = ?',
        }
      );
    });

    it("wrapped 'with' clause delete", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.select('email').from('users');
          })
          .del()
          .where('foo', '=', 'updatedFoo')
          .from('users'),
        {
          mssql:
            'with [withClause] as (select [email] from [users]) delete from [users] where [foo] = ?;select @@rowcount',
          sqlite3:
            'with `withClause` as (select `email` from `users`) delete from `users` where `foo` = ?',
          pg:
            'with "withClause" as (select "email" from "users") delete from "users" where "foo" = ?',
        }
      );
    });

    it("raw 'with' clause", () => {
      testsql(
        qb()
          .with('withRawClause', raw('select "foo" as "baz" from "users"'))
          .select('*')
          .from('withRawClause'),
        {
          mssql:
            'with [withRawClause] as (select "foo" as "baz" from "users") select * from [withRawClause]',
          sqlite3:
            'with `withRawClause` as (select "foo" as "baz" from "users") select * from `withRawClause`',
          pg:
            'with "withRawClause" as (select "foo" as "baz" from "users") select * from "withRawClause"',
          'pg-redshift':
            'with "withRawClause" as (select "foo" as "baz" from "users") select * from "withRawClause"',
          oracledb:
            'with "withRawClause" as (select "foo" as "baz" from "users") select * from "withRawClause"',
        }
      );
    });

    it("chained wrapped 'with' clause", () => {
      testsql(
        qb()
          .with('firstWithClause', function () {
            // @ts-ignore
            this.select('foo').from('users');
          })
          .with('secondWithClause', function () {
            // @ts-ignore
            this.select('bar').from('users');
          })
          .select('*')
          .from('secondWithClause'),
        {
          mssql:
            'with [firstWithClause] as (select [foo] from [users]), [secondWithClause] as (select [bar] from [users]) select * from [secondWithClause]',
          sqlite3:
            'with `firstWithClause` as (select `foo` from `users`), `secondWithClause` as (select `bar` from `users`) select * from `secondWithClause`',
          pg:
            'with "firstWithClause" as (select "foo" from "users"), "secondWithClause" as (select "bar" from "users") select * from "secondWithClause"',
          'pg-redshift':
            'with "firstWithClause" as (select "foo" from "users"), "secondWithClause" as (select "bar" from "users") select * from "secondWithClause"',
          oracledb:
            'with "firstWithClause" as (select "foo" from "users"), "secondWithClause" as (select "bar" from "users") select * from "secondWithClause"',
        }
      );
    });

    it("nested 'with' clause", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.with('withSubClause', function () {
              // @ts-ignore
              this.select('foo')
                .as('baz')
                .from('users');
            })
              .select('*')
              .from('withSubClause');
          })
          .select('*')
          .from('withClause'),
        {
          mssql:
            'with [withClause] as (with [withSubClause] as ((select [foo] from [users]) as [baz]) select * from [withSubClause]) select * from [withClause]',
          sqlite3:
            'with `withClause` as (with `withSubClause` as ((select `foo` from `users`) as `baz`) select * from `withSubClause`) select * from `withClause`',
          pg:
            'with "withClause" as (with "withSubClause" as ((select "foo" from "users") as "baz") select * from "withSubClause") select * from "withClause"',
          'pg-redshift':
            'with "withClause" as (with "withSubClause" as ((select "foo" from "users") as "baz") select * from "withSubClause") select * from "withClause"',
          oracledb:
            'with "withClause" as (with "withSubClause" as ((select "foo" from "users") "baz") select * from "withSubClause") select * from "withClause"',
        }
      );
    });

    it("nested 'with' clause with bindings", () => {
      testsql(
        qb()
          .with('withClause', function () {
            // @ts-ignore
            this.with(
              'withSubClause',
              raw(
                'select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?',
                [1, 20]
              )
            )
              .select('*')
              .from('withSubClause');
          })
          .select('*')
          .from('withClause')
          .where({id: 10}),
        {
          mssql: {
            sql:
              'with [withClause] as (with [withSubClause] as (select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?) select * from [withSubClause]) select * from [withClause] where [id] = ?',
            bindings: [1, 20, 10],
          },
          sqlite3: {
            sql:
              'with `withClause` as (with `withSubClause` as (select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?) select * from `withSubClause`) select * from `withClause` where `id` = ?',
            bindings: [1, 20, 10],
          },
          pg: {
            sql:
              'with "withClause" as (with "withSubClause" as (select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?) select * from "withSubClause") select * from "withClause" where "id" = ?',
            bindings: [1, 20, 10],
          },
          'pg-redshift': {
            sql:
              'with "withClause" as (with "withSubClause" as (select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?) select * from "withSubClause") select * from "withClause" where "id" = ?',
            bindings: [1, 20, 10],
          },
          oracledb: {
            sql:
              'with "withClause" as (with "withSubClause" as (select "foo" as "baz" from "users" where "baz" > ? and "baz" < ?) select * from "withSubClause") select * from "withClause" where "id" = ?',
            bindings: [1, 20, 10],
          },
        }
      );
    });

    it('should return dialect specific sql and bindings with  toSQL().toNative()', () => {
      testNativeSql(
        qb()
          .from('table')
          .where('isIt', true),
        {
          mssql: {
            sql: 'select * from [table] where [isIt] = @p0',
            bindings: [true],
          },
          mysql: {
            sql: 'select * from `table` where `isIt` = ?',
            bindings: [true],
          },
          sqlite3: {
            sql: 'select * from `table` where `isIt` = ?',
            bindings: [true],
          },
          pg: {
            sql: 'select * from "table" where "isIt" = $1',
            bindings: [true],
          },
          oracledb: {
            sql: 'select * from "table" where "isIt" = :1',
            bindings: [1],
          },
        }
      );
    });

    it("nested and chained wrapped 'with' clause", () => {
      testsql(
        qb()
          .with('firstWithClause', function () {
            // @ts-ignore
            this.with('firstWithSubClause', function () {
              // @ts-ignore
              this.select('foo')
                .as('foz')
                .from('users');
            })
              .select('*')
              .from('firstWithSubClause');
          })
          .with('secondWithClause', function () {
            // @ts-ignore
            this.with('secondWithSubClause', function () {
              // @ts-ignore
              this.select('bar')
                .as('baz')
                .from('users');
            })
              .select('*')
              .from('secondWithSubClause');
          })
          .select('*')
          .from('secondWithClause'),
        {
          mssql:
            'with [firstWithClause] as (with [firstWithSubClause] as ((select [foo] from [users]) as [foz]) select * from [firstWithSubClause]), [secondWithClause] as (with [secondWithSubClause] as ((select [bar] from [users]) as [baz]) select * from [secondWithSubClause]) select * from [secondWithClause]',
          sqlite3:
            'with `firstWithClause` as (with `firstWithSubClause` as ((select `foo` from `users`) as `foz`) select * from `firstWithSubClause`), `secondWithClause` as (with `secondWithSubClause` as ((select `bar` from `users`) as `baz`) select * from `secondWithSubClause`) select * from `secondWithClause`',
          pg:
            'with "firstWithClause" as (with "firstWithSubClause" as ((select "foo" from "users") as "foz") select * from "firstWithSubClause"), "secondWithClause" as (with "secondWithSubClause" as ((select "bar" from "users") as "baz") select * from "secondWithSubClause") select * from "secondWithClause"',
          'pg-redshift':
            'with "firstWithClause" as (with "firstWithSubClause" as ((select "foo" from "users") as "foz") select * from "firstWithSubClause"), "secondWithClause" as (with "secondWithSubClause" as ((select "bar" from "users") as "baz") select * from "secondWithSubClause") select * from "secondWithClause"',
          oracledb:
            'with "firstWithClause" as (with "firstWithSubClause" as ((select "foo" from "users") "foz") select * from "firstWithSubClause"), "secondWithClause" as (with "secondWithSubClause" as ((select "bar" from "users") "baz") select * from "secondWithSubClause") select * from "secondWithClause"',
        }
      );
    });

    it("nested and chained wrapped 'withRecursive' clause", () => {
      testsql(
        qb()
          .withRecursive('firstWithClause', function () {
            // @ts-ignore
            this.withRecursive('firstWithSubClause', function () {
              // @ts-ignore
              this.select('foo')
                .as('foz')
                .from('users');
            })
              .select('*')
              .from('firstWithSubClause');
          })
          .withRecursive('secondWithClause', function () {
            // @ts-ignore
            this.withRecursive('secondWithSubClause', function () {
              // @ts-ignore
              this.select('bar')
                .as('baz')
                .from('users');
            })
              .select('*')
              .from('secondWithSubClause');
          })
          .select('*')
          .from('secondWithClause'),
        {
          mssql:
            'with recursive [firstWithClause] as (with recursive [firstWithSubClause] as ((select [foo] from [users]) as [foz]) select * from [firstWithSubClause]), [secondWithClause] as (with recursive [secondWithSubClause] as ((select [bar] from [users]) as [baz]) select * from [secondWithSubClause]) select * from [secondWithClause]',
          sqlite3:
            'with recursive `firstWithClause` as (with recursive `firstWithSubClause` as ((select `foo` from `users`) as `foz`) select * from `firstWithSubClause`), `secondWithClause` as (with recursive `secondWithSubClause` as ((select `bar` from `users`) as `baz`) select * from `secondWithSubClause`) select * from `secondWithClause`',
          pg:
            'with recursive "firstWithClause" as (with recursive "firstWithSubClause" as ((select "foo" from "users") as "foz") select * from "firstWithSubClause"), "secondWithClause" as (with recursive "secondWithSubClause" as ((select "bar" from "users") as "baz") select * from "secondWithSubClause") select * from "secondWithClause"',
          'pg-redshift':
            'with recursive "firstWithClause" as (with recursive "firstWithSubClause" as ((select "foo" from "users") as "foz") select * from "firstWithSubClause"), "secondWithClause" as (with recursive "secondWithSubClause" as ((select "bar" from "users") as "baz") select * from "secondWithSubClause") select * from "secondWithClause"',
          oracledb:
            'with recursive "firstWithClause" as (with recursive "firstWithSubClause" as ((select "foo" from "users") "foz") select * from "firstWithSubClause"), "secondWithClause" as (with recursive "secondWithSubClause" as ((select "bar" from "users") "baz") select * from "secondWithSubClause") select * from "secondWithClause"',
        }
      );
    });

    describe('#2263, update / delete queries in with syntax', () => {
      it('with update query passed as raw', () => {
        testquery(
          qb()
            .with(
              'update1',
              raw('??', [
                qb()
                  .from('accounts')
                  .update({name: 'foo'}),
              ])
            )
            .from('accounts'),
          {
            pg: `with "update1" as (update "accounts" set "name" = 'foo') select * from "accounts"`,
          }
        );
      });

      it('with update query passed as query builder', () => {
        testquery(
          qb()
            .with(
              'update1',
              qb()
                .from('accounts')
                .update({name: 'foo'})
            )
            .from('accounts'),
          {
            pg: `with "update1" as (update "accounts" set "name" = 'foo') select * from "accounts"`,
          }
        );
      });

      it('with update query passed as callback', () => {
        testquery(
          qb()
            .with('update1', (builder) =>
              builder.from('accounts').update({name: 'foo'})
            )
            .from('accounts'),
          {
            pg: `with "update1" as (update "accounts" set "name" = 'foo') select * from "accounts"`,
          }
        );
      });

      it('with delete query passed as raw', () => {
        testquery(
          qb()
            .with(
              'delete1',
              raw('??', [
                qb()
                  .delete()
                  .from('accounts')
                  .where('id', 1),
              ])
            )
            .from('accounts'),
          {
            pg: `with "delete1" as (delete from "accounts" where "id" = 1) select * from "accounts"`,
          }
        );
      });

      it('with delete query passed as query builder', () => {
        testquery(
          qb()
            .with('delete1', (builder) =>
              builder
                .delete()
                .from('accounts')
                .where('id', 1)
            )
            .from('accounts'),
          {
            pg: `with "delete1" as (delete from "accounts" where "id" = 1) select * from "accounts"`,
          }
        );
      });

      it('with delete query passed as callback', () => {
        testquery(
          qb()
            .with(
              'delete1',
              qb()
                .delete()
                .from('accounts')
                .where('id', 1)
            )
            .from('accounts'),
          {
            pg: `with "delete1" as (delete from "accounts" where "id" = 1) select * from "accounts"`,
          }
        );
      });

      it('with places bindings in correct order', () => {
        testquery(
          qb()
            .with(
              'updated_group',
              qb()
                .table('group')
                .update({group_name: 'bar'})
                .where({group_id: 1})
                .returning('group_id')
            )
            .table('user')
            .update({name: 'foo'})
            .where({group_id: 1}),
          {
            pg: `with "updated_group" as (update "group" set "group_name" = 'bar' where "group_id" = 1 returning "group_id") update "user" set "name" = 'foo' where "group_id" = 1`,
          }
        );
      });
    });

    it('#1710, properly escapes arrays in where clauses in postgresql', () => {
      testquery(
        qb()
          .select('*')
          .from('sometable')
          .where('array_field', '&&', [7]),
        {
          pg: 'select * from "sometable" where "array_field" && \'{7}\'',
        }
      );
      testquery(
        qb()
          .select('*')
          .from('sometable')
          .where('array_field', '&&', ['abc', 'def']),
        {
          pg:
            'select * from "sometable" where "array_field" && \'{"abc","def"}\'',
        }
      );
      testquery(
        qb()
          .select('*')
          .from('sometable')
          // @ts-ignore
          .where('array_field', '&&', ['abc', 'def', ['g', 2]]),
        {
          pg:
            'select * from "sometable" where "array_field" && \'{"abc","def",{"g",2}}\'',
        }
      );
    });

    it('#2003, properly escapes objects with toPostgres specialization', () => {
      function TestObject() {
      }

      TestObject.prototype.toPostgres = () => 'foobar';
      testquery(
        qb()
          .table('sometable')
          .insert({id: new TestObject()}),
        {
          pg: 'insert into "sometable" ("id") values (\'foobar\')',
        }
      );
    });

    it('Throws error if .update() results in faulty sql due to no data', () => {
      try {
        qb()
          .table('sometable')
          .update({foobar: undefined})
          .toString();
        throw new Error('Should not reach this point');
      } catch (error) {
        expect(error.message).toEqual(
          'Empty .update() call detected! Update data does not contain any values to update. This will result in a faulty query. Table: sometable. Columns: foobar.'
        );
      }
    });

    it('Throws error if .first() is called on update', () => {
      try {
        qb()
          .table('sometable')
          .update({column: 'value'})
          .first()
          .toSQL();

        throw new Error('Should not reach this point');
      } catch (error) {
        expect(error.message).toEqual(
          'Cannot chain .first() on "update" query!'
        );
      }
    });

    it('Throws error if .first() is called on insert', () => {
      try {
        qb()
          .table('sometable')
          .insert({column: 'value'})
          .first()
          .toSQL();

        throw new Error('Should not reach this point');
      } catch (error) {
        expect(error.message).toEqual(
          'Cannot chain .first() on "insert" query!'
        );
      }
    });

    it('Throws error if .first() is called on delete', () => {
      try {
        qb()
          .table('sometable')
          .del()
          .first()
          .toSQL();

        throw new Error('Should not reach this point');
      } catch (error) {
        expect(error.message).toEqual('Cannot chain .first() on "del" query!');
      }
    });

    describe('knex.ref()', () => {
      it('Can be used as parameter in where-clauses', () => {
        testquery(
          qb()
            .table('sometable')
            .where('sometable.column', ref('someothertable.someothercolumn'))
            .select(),
          {
            pg:
              'select * from "sometable" where "sometable"."column" = "someothertable"."someothercolumn"',
            mysql:
              'select * from `sometable` where `sometable`.`column` = `someothertable`.`someothercolumn`',
            mssql:
              'select * from [sometable] where [sometable].[column] = [someothertable].[someothercolumn]',
            'pg-redshift':
              'select * from "sometable" where "sometable"."column" = "someothertable"."someothercolumn"',
            oracledb:
              'select * from "sometable" where "sometable"."column" = "someothertable"."someothercolumn"',
          }
        );
      });

      it('Can use .as() for alias', () => {
        testquery(
          qb()
            .table('sometable')
            .select(['one', ref('sometable.two').as('Two')]),
          {
            pg: 'select "one", "sometable"."two" as "Two" from "sometable"',
            mysql: 'select `one`, `sometable`.`two` as `Two` from `sometable`',
            mssql: 'select [one], [sometable].[two] as [Two] from [sometable]',
            'pg-redshift':
              'select "one", "sometable"."two" as "Two" from "sometable"',
            oracledb: 'select "one", "sometable"."two" as "Two" from "sometable"',
          }
        );
      });
    });

    it('Can call knex.select(0)', () => {
      testquery(qb().select(0), {
        pg: 'select 0',
        mysql: 'select 0',
        mssql: 'select 0',
        'pg-redshift': 'select 0',
        oracledb: 'select 0',
      });
    });

    it('should warn to user when use `.returning()` function in MySQL', () => {
      const loggerConfigForTestingWarnings = {
        log: {
          warn: (message) => {
            if (
              message ===
              '.returning() is not supported by mysql and will not have any effect.'
            ) {
              throw new Error(message);
            }
          },
        },
      };

      const snowflakeClientForWarnings = new SnowflakeDialect(
        Object.assign({client: SnowflakeDialect}, loggerConfigForTestingWarnings)
      );

      expect(() => {
        testsql(
          qb()
            .into('users')
            .insert({email: 'foo'})
            .returning('id'),
          {
            mysql: {
              sql: 'insert into `users` (`email`) values (?)',
              bindings: ['foo'],
            },
          },
          {
            mysql: snowflakeClientForWarnings,
          }
        );
      }).toThrow(Error);
    });

    it('should warn to user when use `.returning()` function in SQLite3', () => {
      const loggerConfigForTestingWarnings = {
        log: {
          warn: (message) => {
            if (
              message ===
              '.returning() is not supported by sqlite3 and will not have any effect.'
            ) {
              throw new Error(message);
            }
          },
        },
      };

      it('join with subquery using .withSchema', () => {
        testsql(
          qb()
            .from('departments')
            .withSchema('foo')
            .join(
              qb()
                .from('trainees')
                .withSchema('foo')
                .groupBy('department_id')
                .select('department_id', raw('count(*)'))
                .as('trainee_cnts'),
              'trainee_cnts.department_id',
              'departments.id'
            )
            .select('departments.*', 'trainee_cnts.count as trainee_cnt'),
          {
            pg:
              'select "departments".*, "trainee_cnts"."count" as "trainee_cnt" from "foo"."departments" inner join (select "department_id", count(*) from "foo"."trainees" group by "department_id") as "trainee_cnts" on "trainee_cnts"."department_id" = "departments"."id"',
            mysql:
              'select `departments`.*, `trainee_cnts`.`count` as `trainee_cnt` from `foo`.`departments` inner join (select `department_id`, count(*) from `foo`.`trainees` group by `department_id`) as `trainee_cnts` on `trainee_cnts`.`department_id` = `departments`.`id`',
            mssql:
              'select [departments].*, [trainee_cnts].[count] as [trainee_cnt] from [foo].[departments] inner join (select [department_id], count(*) from [foo].[trainees] group by [department_id]) as [trainee_cnts] on [trainee_cnts].[department_id] = [departments].[id]',
            'pg-redshift':
              'select "departments".*, "trainee_cnts"."count" as "trainee_cnt" from "foo"."departments" inner join (select "department_id", count(*) from "foo"."trainees" group by "department_id") as "trainee_cnts" on "trainee_cnts"."department_id" = "departments"."id"',
            oracledb:
              'select "departments".*, "trainee_cnts"."count" "trainee_cnt" from "foo"."departments" inner join (select "department_id", count(*) from "foo"."trainees" group by "department_id") "trainee_cnts" on "trainee_cnts"."department_id" = "departments"."id"',
          }
        );
      });

      it('join with onVal andOnVal orOnVal', () => {
        testsql(
          qb()
            .select({
              id: 'p.ID',
              status: 'p.post_status',
              name: 'p.post_title',
              // type: 'terms.name',
              price: 'price.meta_value',
              createdAt: 'p.post_date_gmt',
              updatedAt: 'p.post_modified_gmt',
            })
            .from({p: 'wp_posts'})
            .leftJoin({price: 'wp_postmeta'}, function () {
              // @ts-ignore
              this.on('p.id', '=', 'price.post_id')
                .on(function () {
                  // @ts-ignore
                  this.on('price.meta_key', '_regular_price').andOn(
                    'price_meta_key',
                    '_regular_price'
                  );
                })
                .orOn(function () {
                  // @ts-ignore
                  this.on('price_meta.key', '_regular_price');
                });
            }),
          {
            pg: {
              sql:
                'select "p"."ID" as "id", "p"."post_status" as "status", "p"."post_title" as "name", "price"."meta_value" as "price", "p"."post_date_gmt" as "createdAt", "p"."post_modified_gmt" as "updatedAt" from "wp_posts" as "p" left join "wp_postmeta" as "price" on "p"."id" = "price"."post_id" and ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            mysql: {
              sql:
                'select `p`.`ID` as `id`, `p`.`post_status` as `status`, `p`.`post_title` as `name`, `price`.`meta_value` as `price`, `p`.`post_date_gmt` as `createdAt`, `p`.`post_modified_gmt` as `updatedAt` from `wp_posts` as `p` left join `wp_postmeta` as `price` on `p`.`id` = `price`.`post_id` and (`price`.`meta_key` = ? and `price_meta_key` = ?) or (`price_meta`.`key` = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            mssql: {
              sql:
                'select [p].[ID] as [id], [p].[post_status] as [status], [p].[post_title] as [name], [price].[meta_value] as [price], [p].[post_date_gmt] as [createdAt], [p].[post_modified_gmt] as [updatedAt] from [wp_posts] as [p] left join [wp_postmeta] as [price] on [p].[id] = [price].[post_id] and ([price].[meta_key] = ? and [price_meta_key] = ?) or ([price_meta].[key] = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            'pg-redshift': {
              sql:
                'select "p"."ID" as "id", "p"."post_status" as "status", "p"."post_title" as "name", "price"."meta_value" as "price", "p"."post_date_gmt" as "createdAt", "p"."post_modified_gmt" as "updatedAt" from "wp_posts" as "p" left join "wp_postmeta" as "price" on "p"."id" = "price"."post_id" and ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            oracledb: {
              sql:
                'select "p"."ID" "id", "p"."post_status" "status", "p"."post_title" "name", "price"."meta_value" "price", "p"."post_date_gmt" "createdAt", "p"."post_modified_gmt" "updatedAt" from "wp_posts" "p" left join "wp_postmeta" "price" on "p"."id" = "price"."post_id" and ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
          }
        );

        testsql(
          qb()
            .select({
              id: 'p.ID',
              status: 'p.post_status',
              name: 'p.post_title',
              // type: 'terms.name',
              price: 'price.meta_value',
              createdAt: 'p.post_date_gmt',
              updatedAt: 'p.post_modified_gmt',
            })
            .from({p: 'wp_posts'})
            .leftJoin({price: 'wp_postmeta'}, (builder) => {
              builder
                .on((q) => {
                  q.on('price.meta_key', '_regular_price').andOn(
                    'price_meta_key',
                    '_regular_price'
                  );
                })
                .orOn((q) => {
                  q.on('price_meta.key', '_regular_price');
                });
            }),
          {
            pg: {
              sql:
                'select "p"."ID" as "id", "p"."post_status" as "status", "p"."post_title" as "name", "price"."meta_value" as "price", "p"."post_date_gmt" as "createdAt", "p"."post_modified_gmt" as "updatedAt" from "wp_posts" as "p" left join "wp_postmeta" as "price" on ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            mysql: {
              sql:
                'select `p`.`ID` as `id`, `p`.`post_status` as `status`, `p`.`post_title` as `name`, `price`.`meta_value` as `price`, `p`.`post_date_gmt` as `createdAt`, `p`.`post_modified_gmt` as `updatedAt` from `wp_posts` as `p` left join `wp_postmeta` as `price` on (`price`.`meta_key` = ? and `price_meta_key` = ?) or (`price_meta`.`key` = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            mssql: {
              sql:
                'select [p].[ID] as [id], [p].[post_status] as [status], [p].[post_title] as [name], [price].[meta_value] as [price], [p].[post_date_gmt] as [createdAt], [p].[post_modified_gmt] as [updatedAt] from [wp_posts] as [p] left join [wp_postmeta] as [price] on ([price].[meta_key] = ? and [price_meta_key] = ?) or ([price_meta].[key] = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            'pg-redshift': {
              sql:
                'select "p"."ID" as "id", "p"."post_status" as "status", "p"."post_title" as "name", "price"."meta_value" as "price", "p"."post_date_gmt" as "createdAt", "p"."post_modified_gmt" as "updatedAt" from "wp_posts" as "p" left join "wp_postmeta" as "price" on ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
            oracledb: {
              sql:
                'select "p"."ID" "id", "p"."post_status" "status", "p"."post_title" "name", "price"."meta_value" "price", "p"."post_date_gmt" "createdAt", "p"."post_modified_gmt" "updatedAt" from "wp_posts" "p" left join "wp_postmeta" "price" on ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
              bindings: ['_regular_price', '_regular_price', '_regular_price'],
            },
          }
        );
      });
    });
  });
});
