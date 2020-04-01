import { SnowflakeDialect } from "../../../src";
import { QueryBuilder } from "knex";
import * as PostgresClient from "knex/lib/dialects/postgres";

// use driverName as key
const clients = {
  "snowflake-sdk": new SnowflakeDialect({client: SnowflakeDialect}),
  pg: new PostgresClient({client: "pg"})
};

const useNullAsDefaultConfig = {useNullAsDefault: true};
// use driverName as key
const clientsWithNullAsDefault = {
  "snowflake-sdk": new SnowflakeDialect(
    Object.assign({client: SnowflakeDialect}, useNullAsDefaultConfig)
  ),
  pg: new PostgresClient({client: "pg"}, useNullAsDefaultConfig)
};

const customLoggerConfig = {
  log: {
    warn: function (message) {
      throw new Error(message);
    },
  },
};
const clientsWithCustomLoggerForTestWarnings = {
  "snowflake-sdk": new SnowflakeDialect(
    Object.assign({client: SnowflakeDialect}, customLoggerConfig)
  ),
  pg: new PostgresClient(Object.assign({client: 'pg'}, customLoggerConfig)),
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
      verifySqlResult(key, {sql: checkValue}, sqlAndBindings);
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
      Object.assign({client: SnowflakeDialect}, customWrapperConfig)
    )
  };

  it('should use custom wrapper', () => {
    testsql(
      qb()
        .withSchema('schema')
        .select('users.foo as bar')
        .from('users'),
      {
        "snowflake-sdk":
          'select "users_wrapper_was_here"."foo_wrapper_was_here" as "bar_wrapper_was_here" from "schema_wrapper_was_here"."users_wrapper_was_here"'
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
          [{email: 'foo', name: 'taylor'}, {email: 'bar', name: 'dayle'}],
          'id'
        ),
      {
        "snowflake-sdk": {
          sql:
            'insert into "users_wrapper_was_here" ("email_wrapper_was_here", "name_wrapper_was_here") values (?, ?), (?, ?)',
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
          [{email: 'foo', name: 'taylor'}, {email: 'bar', name: 'dayle'}],
          ['id', 'name']
        ),
      {
        "snowflake-sdk": {
          sql:
            'insert into "users_wrapper_was_here" ("email_wrapper_was_here", "name_wrapper_was_here") values (?, ?), (?, ?)',
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
          .queryContext({fancy: true}),
        {
          "snowflake-sdk":
            'select "users_fancy_wrapper_was_here"."foo_fancy_wrapper_was_here" as "bar_fancy_wrapper_was_here" from "schema_fancy_wrapper_was_here"."users_fancy_wrapper_was_here"'
        },
        clientsWithCustomIdentifierWrapper
      );
    });

    it('should pass the query context for raw queries', () => {
      testsql(
        qb()
          .select(raw('??', [{a: 'col1'}]).queryContext({fancy: true}))
          .from('users')
          .queryContext({fancy: true}),
        {
          "snowflake-sdk":
            'select "col1_fancy_wrapper_was_here" as "a_fancy_wrapper_was_here" from "users_fancy_wrapper_was_here"'
        },
        clientsWithCustomIdentifierWrapper
      );
    });

    it('should allow chaining', () => {
      const builder = qb();
      expect(builder.queryContext({foo: 'foo'})).toEqual(builder);
    });

    it('should return the query context if called with no arguments', () => {
      expect(
        qb()
          .queryContext({foo: 'foo'})
          .queryContext()
      ).toEqual({foo: 'foo'});
    });

    describe('when a builder is cloned', () => {
      it('should copy the query context', () => {
        expect(
          qb()
            .queryContext({foo: 'foo'})
            .clone()
            .queryContext()
        ).toEqual({foo: 'foo'});
      });

      it('should not modify the original query context if the clone is modified', () => {
        const original = qb().queryContext({foo: 'foo'});
        const clone = original.clone().queryContext({foo: 'bar'});
        expect(original.queryContext()).toEqual({foo: 'foo'});
        expect(clone.queryContext()).toEqual({foo: 'bar'});
      });

      it('should only shallow clone the query context', () => {
        const original = qb().queryContext({foo: {bar: 'baz'}});
        const clone = original.clone();
        clone.queryContext().foo.bar = 'quux';
        expect(original.queryContext()).toEqual({foo: {bar: 'quux'}});
        expect(clone.queryContext()).toEqual({foo: {bar: 'quux'}});
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
        "snowflake-sdk": 'select * from "USERS"'
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
        "snowflake-sdk": 'select "FOO", "BAR", "BAZ", "BOOM" from "USERS"'
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
        "snowflake-sdk": {
          sql: 'select distinct "FOO", "BAR" from "USERS"',
        }
      }
    );
  });

  it('basic select with alias as property-value pairs', () => {
    testsql(
      qb()
        .select({bar: 'foo'})
        .from('users'),
      {
        "snowflake-sdk": 'select "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('basic select with mixed pure column and alias pair', () => {
    testsql(
      qb()
        .select('baz', {bar: 'foo'})
        .from('users'),
      {
        "snowflake-sdk": 'select "BAZ", "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('basic select with array-wrapped alias pair', () => {
    testsql(
      qb()
        .select(['baz', {bar: 'foo'}])
        .from('users'),
      {
        "snowflake-sdk": 'select "BAZ", "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('basic select with mixed pure column and alias pair', () => {
    testsql(
      qb()
        .select({bar: 'foo'})
        .from('users'),
      {
        "snowflake-sdk": 'select "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('basic old-style alias', () => {
    testsql(
      qb()
        .select('foo as bar')
        .from('users'),
      {
        "snowflake-sdk": 'select "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('basic alias trims spaces', () => {
    testsql(
      qb()
        .select(' foo   as bar ')
        .from('users'),
      {
        "snowflake-sdk": 'select "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('allows for case-insensitive alias', () => {
    testsql(
      qb()
        .select(' foo   aS bar ')
        .from('users'),
      {
        "snowflake-sdk": 'select "FOO" as "BAR" from "USERS"'
      }
    );
  });

  it('allows alias with dots in the identifier name', () => {
    testsql(
      qb()
        .select('foo as BAR.BAZ')
        .from('users'),
      {
        "snowflake-sdk": 'select "FOO" as "BAR.BAZ" from "USERS"'
      }
    );
  });

  it('less trivial case of object alias syntax', () => {
    testsql(
      qb()
        .select({
          bar: 'table1.*',
          subq: qb()
            .from('test')
            .select(raw('??', [{a: 'col1', b: 'col2'}]))
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
          'select "TABLE1".* as "BAR", (select "COL1" as "A", "COL2" as "B" from "TEST" limit ?) as "SUBQ" from "TABLE" as "TABLE1", "TABLE" as "TABLE2", (select * from "TEST" limit ?) as "SUBQ"'
      }
    );
  });

  it('basic table wrapping', () => {
    testsql(
      qb()
        .select('*')
        .from('public.users'),
      {
        "snowflake-sdk": 'select * from "PUBLIC"."USERS"'
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
        "snowflake-sdk": 'select * from "MYSCHEMA"."USERS"'
      }
    );
  });

  it('selects from only', () => {
    testsql(
      qb()
        .select('*')
        .from('users', {only: true}),
      {
        "snowflake-sdk": 'select * from only "USERS"',
      }
    );
  });

  it('clear a select', () => {
    testsql(
      qb()
        .select('id', 'EMAIL')
        .from('users')
        .clearSelect(),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS"',
        }
      }
    );

    testsql(
      qb()
        .select('id')
        .from('users')
        .clearSelect()
        .select('EMAIL'),
      {
        "snowflake-sdk": {
          sql: 'select "EMAIL" from "USERS"',
        }
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
        "snowflake-sdk": {
          sql: 'select "ID" from "USERS"',
        }
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
        "snowflake-sdk": {
          sql: 'select "ID" from "USERS" where "ID" = ?',
          bindings: [2],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS"',
        }
      }
    );

    testsql(
      qb()
        .table('users')
        .orderBy('name', 'desc')
        .clearOrder()
        .orderBy('id', 'asc'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by "ID" asc',
        }
      }
    );
  });

  it.skip('clear a having', () => {
    testsql(
      qb()
        .table('users')
        .having('id', '>', 100)
        .clearWhere()
        .having('id', '>', 10),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" having "ID" > ?',
          bindings: [10],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ?',
          bindings: [1],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1),
      {
        "snowflake-sdk": 'select * from "USERS" where "ID" = 1'
      }
    );
  });

  it.skip('whereColumn', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('users.id', '=', 'users.otherId'),
      {
        "snowflake-sdk": 'select * from "USERS" where "USERS"."ID" = "USERS"."otherId"'
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
          sql: 'select * from "USERS" where not "ID" = ?',
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
        "snowflake-sdk": 'select * from "USERS" where not "ID" = 1'
      }
    );
  });

  it('grouped or where not', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNot(function () {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where not ("ID" = ? or not "ID" = ?)',
          bindings: [1, 3],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .whereNot(function () {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": 'select * from "USERS" where not ("ID" = 1 or not "ID" = 3)'
      }
    );
  });

  it('grouped or where not alternate', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(function () {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where ("ID" = ? or not "ID" = ?)',
          bindings: [1, 3],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .where(function () {
          // @ts-ignore
          this.where('id', '=', 1).orWhereNot('id', '=', 3);
        }),
      {
        "snowflake-sdk": 'select * from "USERS" where ("ID" = 1 or not "ID" = 3)'
      }
    );
  });

  it('where not object', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNot({first_name: 'Test', last_name: 'User'}),
      {
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where not "FIRST_NAME" = ? and not "LAST_NAME" = ?',
          bindings: ['Test', 'User'],
        }
      }
    );

    testquery(
      qb()
        .select('*')
        .from('users')
        .whereNot({first_name: 'Test', last_name: 'User'}),
      {
        "snowflake-sdk":
          `select * from "USERS" where not "FIRST_NAME" = 'Test' and not "LAST_NAME" = 'User'`
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
        "snowflake-sdk": 'select * from "USERS" where 1 = 1'
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" between ? and ?',
          bindings: [1, 2],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "NAME" = ? and "ID" between ? and ?',
          bindings: ['user1', 1, 2],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "NAME" = ? and "ID" not between ? and ?',
          bindings: ['user1', 1, 2],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" between ? and ?',
          bindings: [1, 2],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" not between ? and ?',
          bindings: [1, 2],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" not between ? and ?',
          bindings: [1, 2],
        }
      }
    );
  });

  it('basic or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhere('EMAIL', '=', 'foo'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "EMAIL" = ?',
          bindings: [1, 'foo'],
        }
      }
    );
  });

  it('chained or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.where('EMAIL', '=', 'foo'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "EMAIL" = ?',
          bindings: [1, 'foo'],
        }
      }
    );
  });

  it('raw column wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        // @ts-ignore
        .where(raw('LCASE("NAME")'), 'foo'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where LCASE("NAME") = ?',
          bindings: ['foo'],
        }
      }
    );
  });

  it('raw wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where(raw('id = ? or EMAIL = ?', [1, 'foo'])),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where id = ? or EMAIL = ?',
          bindings: [1, 'foo'],
        }
      }
    );
  });

  it('raw or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .orWhere(raw('EMAIL = ?', ['foo'])),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or EMAIL = ?',
          bindings: [1, 'foo'],
        }
      }
    );
  });

  it('chained raw or wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .or.where(raw('EMAIL = ?', ['foo'])),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or EMAIL = ?',
          bindings: [1, 'foo'],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" in (?, ?, ?)',
          bindings: [1, 2, 3],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where ("A", "B") in ((?, ?), (?, ?), (?, ?))',
          bindings: [1, 2, 3, 4, 5, 6],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "ID" in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" not in (?, ?, ?)',
          bindings: [1, 2, 3],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "ID" not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "ID" in (?, ?, ?)',
          bindings: [1, 4, 2, 3],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" not in (?, ?, ?)',
          bindings: [1, 2, 3],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "ID" not in (?, ?, ?)',
          bindings: [1, 1, 2, 3],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where 1 = ?',
          bindings: [0],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where 1 = ?',
          bindings: [1],
        }
      }
    );
  });

  it('should allow a function as the first argument, for a grouped where clause', () => {
    const partial = qb()
      .table('test')
      .where('id', '=', 1);
    testsql(partial, {
      "snowflake-sdk": 'select * from "TEST" where "ID" = ?'
    });

    const subWhere = function (sql) {
      // @ts-ignore
      expect(this).toEqual(sql);
      // @ts-ignore
      this.where({id: 3}).orWhere('id', 4);
    };

    testsql(partial.where(subWhere), {
      "snowflake-sdk": {
        sql: 'select * from "TEST" where "ID" = ? and ("ID" = ? or "ID" = ?)',
        bindings: [1, 3, 4],
      }
    });
  });

  it('should accept a function as the "VALUE", for a sub select', () => {
    const chain = qb().where('id', '=', function (qb) {
      // @ts-ignore
      expect(this).toEqual(qb);
      // @ts-ignore
      this.select('account_id')
        .from('names')
        .where('names.id', '>', 1)
        .orWhere(function () {
          // @ts-ignore
          this.where('names.first_name', 'like', 'Tim%').andWhere(
            'names.id',
            '>',
            10
          );
        });
    });

    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * where "ID" = (select "ACCOUNT_ID" from "NAMES" where "NAMES"."ID" > ? or ("NAMES"."FIRST_NAME" like ? and "NAMES"."ID" > ?))',
        bindings: [1, 'Tim%', 10],
      }
    });

    testquery(chain, {
      "snowflake-sdk":
        `select * where "ID" = (select "ACCOUNT_ID" from "NAMES" where "NAMES"."ID" > 1 or ("NAMES"."FIRST_NAME" like 'Tim%' and "NAMES"."ID" > 10))`
    });
  });

  it('should accept a function as the "VALUE", for a sub select when chained', () => {
    const chain = qb().where('id', '=', function (qb) {
      // @ts-ignore
      expect(this).toEqual(qb);
      // @ts-ignore
      this.select('account_id')
        .from('names')
        .where('names.id', '>', 1)
        .or.where(function () {
        // @ts-ignore
        this.where('names.first_name', 'like', 'Tim%').and.where(
          'names.id',
          '>',
          10
        );
      });
    });

    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * where "ID" = (select "ACCOUNT_ID" from "NAMES" where "NAMES"."ID" > ? or ("NAMES"."FIRST_NAME" like ? and "NAMES"."ID" > ?))',
        bindings: [1, 'Tim%', 10],
      }
    });
  });

  it('should not do whereNull on where("FOO", "<>", null) #76', () => {
    testquery(qb().where('foo', '<>', null), {
      "snowflake-sdk": 'select * where "FOO" <> NULL'
    });
  });

  it('should expand where("FOO", "!=") to - where id = "!="', () => {
    testquery(qb().where('foo', '!='), {
      "snowflake-sdk": `select * where "FOO" = '!='`
    });
  });

  it('unions', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .union(function () {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 2);
      });
    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ?',
        bindings: [1, 2],
      }
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .union(
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        }
      );
    testsql(multipleArgumentsChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .union([
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        },
      ]);
    testsql(arrayChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });
  });

  it.skip('wraps unions', () => {
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
          'select * from "USERS" where "ID" in (select max("ID") from "USERS" union (select min("ID") from "USERS"))',
        bindings: [],
      }
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    const multipleArgumentsWrappedChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .union(
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        },
        // @ts-ignore
        true
      );
    testsql(multipleArgumentsWrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union (select * from "USERS" where "ID" = ?) union (select * from "USERS" where "ID" = ?)',
        bindings: [1, 2, 3],
      }
    });

    const arrayWrappedChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .union(
        [
          function () {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({id: 2});
          },
          function () {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({id: 3});
          },
        ],
        true
      );
    testsql(arrayWrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union (select * from "USERS" where "ID" = ?) union (select * from "USERS" where "ID" = ?)',
        bindings: [1, 2, 3],
      }
    });
  });

  it('wraps union alls', () => {
    const wrappedChain = qb()
      .select('*')
      .from('users')
      // @ts-ignore
      .where('id', 'in', function () {
        // @ts-ignore
        this.table('users')
          .max('id')
          .unionAll(function () {
            // @ts-ignore
            this.table('users').min('id');
          }, true);
      });
    testsql(wrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" in (select max("ID") from "USERS" union all (select min("ID") from "USERS"))',
        bindings: [],
      }
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    const multipleArgumentsWrappedChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .unionAll(
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        },
        // @ts-ignore
        true
      );
    testsql(multipleArgumentsWrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all (select * from "USERS" where "ID" = ?) union all (select * from "USERS" where "ID" = ?)',
        bindings: [1, 2, 3],
      }
    });

    const arrayWrappedChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .unionAll(
        [
          function () {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({id: 2});
          },
          function () {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({id: 3});
          },
        ],
        true
      );
    testsql(arrayWrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all (select * from "USERS" where "ID" = ?) union all (select * from "USERS" where "ID" = ?)',
        bindings: [1, 2, 3],
      }
    });
  });

  // it("handles grouped mysql unions", function() {
  //   chain = myqb().union(
  //     raw(myqb().select('*').from('users').where('id', '=', 1)).wrap('(', ')'),
  //     raw(myqb().select('*').from('users').where('id', '=', 2)).wrap('(', ')')
  //   ).orderBy('id').limit(10).toSQL();
  //   expect(chain.sql).toEqual('(select * from "USERS" where "ID" = ?) union (select * from "USERS" where "ID" = ?) order by "ID" asc limit ?');
  //   expect(chain.bindings).to.eql([1, 2, 10]);
  // });

  it('union alls', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .unionAll(function () {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 2);
      });
    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ?',
        bindings: [1, 2],
      }
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .unionAll(
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        }
      );
    testsql(multipleArgumentsChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .unionAll([
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        },
      ]);
    testsql(arrayChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
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
      .union(function () {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 3);
      });
    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .union([
        qb()
          .select('*')
          .from('users')
          .where({id: 2}),
        raw('select * from users where id = ?', [3]),
      ]);
    testsql(arrayChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      }
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .union(
        qb()
          .select('*')
          .from('users')
          .where({id: 2}),
        raw('select * from users where id = ?', [3])
      );
    testsql(multipleArgumentsChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union select * from "USERS" where "ID" = ? union select * from users where id = ?',
        bindings: [1, 2, 3],
      }
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
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .unionAll([
        qb()
          .select('*')
          .from('users')
          .where({id: 2}),
        raw('select * from users where id = ?', [3]),
      ]);
    testsql(arrayChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      }
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .unionAll(
        qb()
          .select('*')
          .from('users')
          .where({id: 2}),
        raw('select * from users where id = ?', [3])
      );
    testsql(multipleArgumentsChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? union all select * from "USERS" where "ID" = ? union all select * from users where id = ?',
        bindings: [1, 2, 3],
      }
    });
  });

  it('intersects', () => {
    const chain = qb()
      .select('*')
      .from('users')
      .where('id', '=', 1)
      .intersect(function () {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 2);
      });

    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ?',
        bindings: [1, 2],
      }
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .intersect(
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        }
      );
    testsql(multipleArgumentsChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .intersect([
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        },
      ]);
    testsql(arrayChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });
  });

  it('wraps intersects', () => {
    // @ts-ignore
    const wrappedChain = qb()
      .select('*')
      .from('users')
      // @ts-ignore
      .where('id', 'in', function () {
        // @ts-ignore
        this.table('users')
          .max('id')
          .intersect(function () {
            // @ts-ignore
            this.table('users').min('id');
          }, true);
      });
    testsql(wrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" in (select max("ID") from "USERS" intersect (select min("ID") from "USERS"))',
        bindings: [],
      }
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    const multipleArgumentsWrappedChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .intersect(
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 2});
        },
        function () {
          // @ts-ignore
          this.select('*')
            .from('users')
            .where({id: 3});
        },
        // @ts-ignore
        true
      );
    testsql(multipleArgumentsWrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect (select * from "USERS" where "ID" = ?) intersect (select * from "USERS" where "ID" = ?)',
        bindings: [1, 2, 3],
      }
    });

    const arrayWrappedChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .intersect(
        [
          function () {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({id: 2});
          },
          function () {
            // @ts-ignore
            this.select('*')
              .from('users')
              .where({id: 3});
          },
        ],
        true
      );
    testsql(arrayWrappedChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect (select * from "USERS" where "ID" = ?) intersect (select * from "USERS" where "ID" = ?)',
        bindings: [1, 2, 3],
      }
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
      .intersect(function () {
        // @ts-ignore
        this.select('*')
          .from('users')
          .where('id', '=', 3);
      });
    testsql(chain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ?',
        bindings: [1, 2, 3],
      }
    });

    const arrayChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .intersect([
        qb()
          .select('*')
          .from('users')
          .where({id: 2}),
        raw('select * from users where id = ?', [3]),
      ]);
    testsql(arrayChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      }
    });

    const multipleArgumentsChain = qb()
      .select('*')
      .from('users')
      .where({id: 1})
      .intersect(
        qb()
          .select('*')
          .from('users')
          .where({id: 2}),
        raw('select * from users where id = ?', [3])
      );
    testsql(multipleArgumentsChain, {
      "snowflake-sdk": {
        sql:
          'select * from "USERS" where "ID" = ? intersect select * from "USERS" where "ID" = ? intersect select * from users where id = ?',
        bindings: [1, 2, 3],
      }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "ID" in (select "ID" from "USERS" where "AGE" > ? limit ?)',
          bindings: [25, 3],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where ("ID_A", "ID_B") in (select "ID_A", "ID_B" from "USERS" where "AGE" > ? limit ?)',
          bindings: [25, 3],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "ID" not in (select "ID" from "USERS" where "AGE" > ?)',
          bindings: [25],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" is null',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "ID" is null',
          bindings: [1],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" is not null',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" > ? or "ID" is not null',
          bindings: [1],
        }
      }
    );
  });

  it('group bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .groupBy('id', 'EMAIL'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" group by "ID", "EMAIL"',
          bindings: [],
        }
      }
    );
  });

  it('order bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy('EMAIL')
        .orderBy('age', 'desc'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by "EMAIL" asc, "AGE" desc',
          bindings: [],
        }
      }
    );
  });

  it('order by array', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy(['EMAIL', {column: 'age', order: 'desc'}]),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by "EMAIL" asc, "AGE" desc',
          bindings: [],
        }
      }
    );
  });

  it('order by array without order', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy([{column: 'EMAIL'}, {column: 'age', order: 'desc'}]),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by "EMAIL" asc, "AGE" desc',
          bindings: [],
        }
      }
    );
  });

  it.skip('order by accepts query builder', () => {
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
        "snowflake-sdk": {
          sql:
            'select * from "PERSONS" order by (select "P"."ID" from "PERSONS" as "P" where "PERSONS"."ID" = "P"."ID") asc',
          bindings: [],
        }
      }
    );
  });

  it('raw group bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .groupByRaw('id, EMAIL'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" group by id, EMAIL',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by col NULLS LAST asc',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by col NULLS LAST desc',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by col NULLS LAST DESC',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by col NULLS LAST ?',
          bindings: ['dEsc'],
        }
      }
    );
  });

  it('multiple order bys', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy('EMAIL')
        .orderBy('age', 'desc'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" order by "EMAIL" asc, "AGE" desc',
          bindings: [],
        }
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
        "snowflake-sdk": 'select * from "USERS" having "EMAIL" > ?'
      }
    );
  });

  it('or having', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having('baz', '>', 5)
        .orHaving('email', '=', 10),
      {
        "snowflake-sdk": 'select * from "USERS" having "BAZ" > ? or "EMAIL" = ?'
      }
    );
  });

  it('nested having', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having(function () {
          // @ts-ignore
          this.where('email', '>', 1);
        }),
      {
        "snowflake-sdk": 'select * from "USERS" having ("EMAIL" > ?)'
      }
    );
  });

  it('nested or havings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having(function () {
          // @ts-ignore
          this.where('email', '>', 10);
          // @ts-ignore
          this.orWhere('email', '=', 7);
        }),
      {
        "snowflake-sdk": 'select * from "USERS" having ("EMAIL" > ? or "EMAIL" = ?)'
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
        "snowflake-sdk": 'select * from "USERS" group by "EMAIL" having "EMAIL" > ?'
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
        "snowflake-sdk":
          'select "EMAIL" as "FOO_EMAIL" from "USERS" having "FOO_EMAIL" > ?'
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
        "snowflake-sdk": 'select * from "USERS" having user_foo < user_bar'
      }
    );
  });

  it('raw or havings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .having('baz', '=', 1)
        .orHaving(raw('user_foo < user_bar')),
      {
        "snowflake-sdk": 'select * from "USERS" having "BAZ" = ? or user_foo < user_bar'
      }
    );
  });

  it('having null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .havingNull('baz'),
      {
        "snowflake-sdk": 'select * from "USERS" having "BAZ" is null'
      }
    );
  });

  it('or having null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .havingNull('baz')
        .orHavingNull('foo'),
      {
        "snowflake-sdk": 'select * from "USERS" having "BAZ" is null or "FOO" is null'
      }
    );
  });

  it('having not null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .havingNotNull('baz'),
      {
        "snowflake-sdk": 'select * from "USERS" having "BAZ" is not null'
      }
    );
  });

  it('or having not null', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .havingNotNull('baz')
        .orHavingNotNull('foo'),
      {
        "snowflake-sdk":
          'select * from "USERS" having "BAZ" is not null or "FOO" is not null'
      }
    );
  });

  it('having exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .havingExists(function () {
          // @ts-ignore
          this.select('baz').from('users');
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" having exists (select "BAZ" from "USERS")'
      }
    );
  });

  it('or having exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .havingExists(function () {
          //@ts-ignore
          this.select('baz').from('users');
        })
        .orHavingExists(function () {
          // @ts-ignore
          this.select('foo').from('users');
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" having exists (select "BAZ" from "USERS") or exists (select "FOO" from "USERS")'
      }
    );
  });

  it('where not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotExists(function () {
          // @ts-ignore
          this.select('baz').from('users');
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" where not exists (select "BAZ" from "USERS")'
      }
    );
  });

  it('or where not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereNotExists(function () {
          // @ts-ignore
          this.select('baz').from('users');
        })
        .orWhereNotExists(function () {
          // @ts-ignore
          this.select('foo').from('users');
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" where not exists (select "BAZ" from "USERS") or not exists (select "FOO" from "USERS")'
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
        "snowflake-sdk": 'select * from "USERS" where "BAZ" between ? and ?'
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
        "snowflake-sdk":
          'select * from "USERS" where "BAZ" between ? and ? or "BAZ" between ? and ?'
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
        "snowflake-sdk": 'select * from "USERS" where "BAZ" not between ? and ?'
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
        "snowflake-sdk":
          'select * from "USERS" where "BAZ" not between ? and ? or "BAZ" not between ? and ?'
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
        "snowflake-sdk": 'select * from "USERS" where "BAZ" in (?, ?, ?)'
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
        "snowflake-sdk":
          'select * from "USERS" where "BAZ" in (?, ?, ?) or "FOO" in (?, ?)'
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
        "snowflake-sdk": 'select * from "USERS" where "BAZ" not in (?, ?, ?)'
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
        "snowflake-sdk":
          'select * from "USERS" where "BAZ" not in (?, ?, ?) or "FOO" not in (?, ?)'
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" limit ?',
          bindings: [10],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" limit ?',
          bindings: [0],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" limit ? offset ?',
          bindings: [10, 5],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" limit ? offset 5',
          bindings: [10],
        }
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
        "snowflake-sdk": {
          sql: 'select name = ? as isJohn from "USERS" limit ?',
          bindings: ['john', 1],
        }
      }
    );
  });

  it('first', () => {
    testsql(
      qb()
        .first('*')
        .from('users'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" limit ?',
          bindings: [1],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" limit 18446744073709551615 offset ?',
          bindings: [5],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" = ? or "NAME" = ?',
          bindings: [1, 'foo'],
        }
      }
    );
  });

  it('nested wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('EMAIL', '=', 'foo')
        .orWhere((qb) => {
          qb.where('name', '=', 'bar').where('age', '=', 25);
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "EMAIL" = ? or ("NAME" = ? and "AGE" = ?)',
          bindings: ['foo', 'bar', 25],
        }
      }
    );
  });

  it('clear nested wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('EMAIL', '=', 'foo')
        .orWhere((qb) => {
          qb.where('name', '=', 'bar')
            .where('age', '=', 25)
            .clearWhere();
        }),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "EMAIL" = ?',
          bindings: ['foo'],
        }
      }
    );
  });

  it('clear where and nested wheres', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('EMAIL', '=', 'foo')
        .orWhere((qb) => {
          qb.where('name', '=', 'bar').where('age', '=', 25);
        })
        .clearWhere(),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS"',
        }
      }
    );
  });

  it('full sub selects', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('EMAIL', '=', 'foo')
        // @ts-ignore
        .orWhere('id', '=', (qb) => {
          qb.select(raw('max(id)'))
            .from('users')
            .where('EMAIL', '=', 'bar');
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "EMAIL" = ? or "ID" = (select max(id) from "USERS" where "EMAIL" = ?)',
          bindings: ['foo', 'bar'],
        }
      }
    );
  });

  it('clear nested selects', () => {
    testsql(
      qb()
        .select('EMAIL')
        .from('users')
        .where('EMAIL', '=', 'foo')
        // @ts-ignore
        .orWhere('id', '=', (qb) => {
          qb.select(raw('max(id)'))
            .from('users')
            .where('EMAIL', '=', 'bar')
            .clearSelect();
        }),
      {
        "snowflake-sdk": {
          sql:
            'select "EMAIL" from "USERS" where "EMAIL" = ? or "ID" = (select * from "USERS" where "EMAIL" = ?)',
          bindings: ['foo', 'bar'],
        }
      }
    );
  });

  it('clear non nested selects', () => {
    testsql(
      qb()
        .select('EMAIL')
        .from('users')
        .where('EMAIL', '=', 'foo')
        // @ts-ignore
        .orWhere('id', '=', (qb) => {
          qb.select(raw('max(id)'))
            .from('users')
            .where('EMAIL', '=', 'bar');
        })
        .clearSelect(),
      {
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "EMAIL" = ? or "ID" = (select max(id) from "USERS" where "EMAIL" = ?)',
          bindings: ['foo', 'bar'],
        }
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
            .where('products.id', '=', raw('"ORDERS"."ID"'));
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "ORDERS" where exists (select * from "PRODUCTS" where "PRODUCTS"."ID" = "ORDERS"."ID")',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "ORDERS" where exists (select * from "PRODUCTS" where products.id = orders.id)',
          bindings: [],
        }
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
            .where('products.id', '=', raw('"ORDERS"."ID"'));
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "ORDERS" where not exists (select * from "PRODUCTS" where "PRODUCTS"."ID" = "ORDERS"."ID")',
          bindings: [],
        }
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
            .where('products.id', '=', raw('"ORDERS"."ID"'));
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "ORDERS" where "ID" = ? or exists (select * from "PRODUCTS" where "PRODUCTS"."ID" = "ORDERS"."ID")',
          bindings: [1],
        }
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
            .where('products.id', '=', raw('"ORDERS"."ID"'));
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "ORDERS" where "ID" = ? or not exists (select * from "PRODUCTS" where "PRODUCTS"."ID" = "ORDERS"."ID")',
          bindings: [1],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" cross join "CONTRACTS" cross join "PHOTOS"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" full outer join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" cross join "CONTRACTS" on "USERS"."CONTRACTID" = "CONTRACTS"."ID"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" left join "PHOTOS" on "USERS"."ID" = "PHOTOS"."ID"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" right join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" right outer join "PHOTOS" on "USERS"."ID" = "PHOTOS"."ID"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" or "USERS"."NAME" = "CONTACTS"."NAME"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" inner join "CONTACTS" on ("USERS"."ID" = "CONTACTS"."ID" or "USERS"."NAME" = "CONTACTS"."NAME")',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and 1 = 0',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = 1 left join "PHOTOS" on "PHOTOS"."TITLE" = ?',
          bindings: ['My Photo'],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "MYSCHEMA"."USERS" inner join "MYSCHEMA"."CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" left join "MYSCHEMA"."PHOTOS" on "USERS"."ID" = "PHOTOS"."ID"',
          bindings: [],
        }
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ADDRESS" is null'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ADDRESS" is null or "CONTACTS"."PHONE" is null',
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ADDRESS" is not null'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ADDRESS" is not null or "CONTACTS"."PHONE" is not null'
      }
    );
  });

  it('on exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onExists(function () {
            // @ts-ignore
            this.select('*').from('foo');
          });
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and exists (select * from "FOO")'
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
            .onExists(function () {
              // @ts-ignore
              this.select('*').from('foo');
            })
            .orOnExists(function () {
              // @ts-ignore
              this.select('*').from('bar');
            });
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and exists (select * from "FOO") or exists (select * from "BAR")'
      }
    );
  });

  it('on not exists', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .join('contacts', (qb) => {
          qb.on('users.id', '=', 'contacts.id').onNotExists(function () {
            // @ts-ignore
            this.select('*').from('foo');
          });
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and not exists (select * from "FOO")'
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
            .onNotExists(function () {
              // @ts-ignore
              this.select('*').from('foo');
            })
            .orOnNotExists(function () {
              // @ts-ignore
              this.select('*').from('bar');
            });
        }),
      {
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and not exists (select * from "FOO") or not exists (select * from "BAR")'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" between ? and ?'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" between ? and ? or "USERS"."ID" between ? and ?'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" not between ? and ?'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" not between ? and ? or "USERS"."ID" not between ? and ?'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" in (?, ?, ?, ?)'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" in (?, ?, ?, ?) or "USERS"."ID" in (?, ?)'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" not in (?, ?, ?, ?)'
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
        "snowflake-sdk":
          'select * from "USERS" inner join "CONTACTS" on "USERS"."ID" = "CONTACTS"."ID" and "CONTACTS"."ID" not in (?, ?, ?, ?) or "USERS"."ID" not in (?, ?)'
      }
    );
  });

  it('raw expressions in select', () => {
    testsql(
      qb()
        .select(raw('substr(foo, 6)'))
        .from('users'),
      {
        "snowflake-sdk": {
          sql: 'select substr(foo, 6) from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count', () => {
    testsql(
      qb()
        .from('users')
        .count(),
      {
        "snowflake-sdk": {
          sql: 'select count(*) from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count distinct', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct(),
      {
        "snowflake-sdk": {
          sql: 'select count(distinct *) from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count with string alias', () => {
    testsql(
      qb()
        .from('users')
        .count('* as all'),
      {
        "snowflake-sdk": {
          sql: 'select count(*) as "ALL" from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count with object alias', () => {
    testsql(
      qb()
        .from('users')
        .count({all: '*'}),
      {
        "snowflake-sdk": {
          sql: 'select count(*) as "ALL" from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count distinct with string alias', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct('* as all'),
      {
        "snowflake-sdk": {
          sql: 'select count(distinct *) as "ALL" from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count distinct with object alias', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct({all: '*'}),
      {
        "snowflake-sdk": {
          sql: 'select count(distinct *) as "ALL" from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count with raw values', () => {
    testsql(
      qb()
        .from('users')
        .count(raw('??', 'name')),
      {
        "snowflake-sdk": {
          sql: 'select count("NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count distinct with raw values', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct(raw('??', 'name')),
      {
        "snowflake-sdk": {
          sql: 'select count(distinct "NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count distinct with multiple columns', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct('foo', 'bar'),
      {
        "snowflake-sdk": {
          sql: 'select count(distinct "FOO", "BAR") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('count distinct with multiple columns with alias', () => {
    testsql(
      qb()
        .from('users')
        .countDistinct({alias: ['foo', 'bar']}),
      {
        "snowflake-sdk": {
          sql: 'select count(distinct "FOO", "BAR") as "ALIAS" from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('max', () => {
    testsql(
      qb()
        .from('users')
        .max('id'),
      {
        "snowflake-sdk": {
          sql: 'select max("ID") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('max with raw values', () => {
    testsql(
      qb()
        .from('users')
        .max(raw('??', ['name'])),
      {
        "snowflake-sdk": {
          sql: 'select max("NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('min', () => {
    testsql(
      qb()
        .from('users')
        .max('id'),
      {
        "snowflake-sdk": {
          sql: 'select max("ID") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('min with raw values', () => {
    testsql(
      qb()
        .from('users')
        .min(raw('??', ['name'])),
      {
        "snowflake-sdk": {
          sql: 'select min("NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('sum', () => {
    testsql(
      qb()
        .from('users')
        .sum('id'),
      {
        "snowflake-sdk": {
          sql: 'select sum("ID") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('sum with raw values', () => {
    testsql(
      qb()
        .from('users')
        .sum(raw('??', ['name'])),
      {
        "snowflake-sdk": {
          sql: 'select sum("NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('sum distinct', () => {
    testsql(
      qb()
        .from('users')
        .sumDistinct('id'),
      {
        "snowflake-sdk": {
          sql: 'select sum(distinct "ID") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('sum distinct with raw values', () => {
    testsql(
      qb()
        .from('users')
        .sumDistinct(raw('??', ['name'])),
      {
        "snowflake-sdk": {
          sql: 'select sum(distinct "NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('avg', () => {
    testsql(
      qb()
        .from('users')
        .avg('id'),
      {
        "snowflake-sdk": {
          sql: 'select avg("ID") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('avg with raw values', () => {
    testsql(
      qb()
        .from('users')
        .avg(raw('??', ['name'])),
      {
        "snowflake-sdk": {
          sql: 'select avg("NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('avg distinct with raw values', () => {
    testsql(
      qb()
        .from('users')
        .avgDistinct(raw('??', ['name'])),
      {
        "snowflake-sdk": {
          sql: 'select avg(distinct "NAME") from "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('insert method', () => {
    testsql(
      qb()
        .into('users')
        .insert({EMAIL: 'foo'}),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" ("EMAIL") values (?)',
          bindings: ['foo'],
        }
      }
    );
  });

  it('multiple inserts', () => {
    testsql(
      qb()
        .from('users')
        .insert([
          {EMAIL: 'foo', name: 'taylor'},
          {EMAIL: 'bar', name: 'dayle'},
        ]),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" ("EMAIL", "NAME") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        }
      }
    );
  });

  it('multiple inserts with partly undefined keys client with configuration nullAsDefault: true', () => {
    testquery(
      qb()
        .from('users')
        .insert([{EMAIL: 'foo', name: 'taylor'}, {name: 'dayle'}]),
      {
        "snowflake-sdk":
          `insert into "USERS" ("EMAIL", "NAME") values ('foo', 'taylor'), (NULL, 'dayle')`
      },
      clientsWithNullAsDefault
    );
  });

  it('multiple inserts with partly undefined keys', () => {
    testquery(
      qb()
        .from('users')
        .insert([{EMAIL: 'foo', name: 'taylor'}, {name: 'dayle'}]),
      {
        "snowflake-sdk":
          `insert into "USERS" ("EMAIL", "NAME") values ('foo', 'taylor'), (DEFAULT, 'dayle')`
      }
    );
  });

  it('multiple inserts with returning', () => {
    // returning only supported directly by postgres and with workaround with oracle
    // other databases implicitly return the inserted id
    testsql(
      qb()
        .from('users')
        .insert(
          [{EMAIL: 'foo', name: 'taylor'}, {EMAIL: 'bar', name: 'dayle'}],
          'id'
        ),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" ("EMAIL", "NAME") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        }
      }
    );
  });

  it('multiple inserts with multiple returning', () => {
    testsql(
      qb()
        .from('users')
        .insert(
          [{EMAIL: 'foo', name: 'taylor'}, {EMAIL: 'bar', name: 'dayle'}],
          ['id', 'name']
        ),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" ("EMAIL", "NAME") values (?, ?), (?, ?)',
          bindings: ['foo', 'taylor', 'bar', 'dayle'],
        }
      }
    );
  });

  it('insert method respects raw bindings', () => {
    testsql(
      qb()
        .insert({EMAIL: raw('CURRENT TIMESTAMP')})
        .into('users'),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" ("EMAIL") values (CURRENT TIMESTAMP)',
          bindings: [],
        }
      }
    );
  });

  it('normalizes for missing keys in insert', () => {
    const data = [{a: 1}, {b: 2}, {a: 2, c: 3}];

    testsql(
      qb()
        .insert(data)
        .into('table'),
      {
        "snowflake-sdk": {
          sql:
            'insert into "TABLE" ("A", "B", "C") values (?, DEFAULT, DEFAULT), (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
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
        "snowflake-sdk": {
          sql: '',
          bindings: [],
        }
      }
    );
  });

  it('insert with array with empty object and returning', () => {
    testsql(
      qb()
        .into('users')
        .insert([{}], 'id'),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" () values ()',
          bindings: [],
        }
      }
    );
  });

  it('update method', () => {
    testsql(
      qb()
        .update({EMAIL: 'foo', name: 'bar'})
        .table('users')
        .where('id', '=', 1),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = ?, "NAME" = ? where "ID" = ?',
          bindings: ['foo', 'bar', 1],
        }
      }
    );
  });

  it('update only method', () => {
    testsql(
      qb()
        .update({EMAIL: 'foo', name: 'bar'})
        .table('users', {only: true})
        .where('id', '=', 1),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = ?, "NAME" = ? where "ID" = ?',
          bindings: ['foo', 'bar', 1],
        },
      }
    );
  });

  it('should not update columns undefined values', () => {
    testsql(
      qb()
        .update({EMAIL: 'foo', name: undefined})
        .table('users')
        .where('id', '=', 1),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = ? where "ID" = ?',
          bindings: ['foo', 1],
        }
      }
    );
  });

  it("should allow for 'null' updates", () => {
    testsql(
      qb()
        .update({EMAIL: null, name: 'bar'})
        .table('users')
        .where('id', 1),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = ?, "NAME" = ? where "ID" = ?',
          bindings: [null, 'bar', 1],
        }
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
        .update({EMAIL: 'foo', name: 'bar'}),
      {
        "snowflake-sdk": {
          sql:
            'update "USERS" set "EMAIL" = ?, "NAME" = ? where "ID" = ? order by "FOO" desc limit ?',
          bindings: ['foo', 'bar', 1, 5],
        }
      }
    );
  });

  it('update method with joins snowflake', () => {
    testsql(
      qb()
        .from('users')
        .join('orders', 'users.id', 'orders.user_id')
        .where('users.id', '=', 1)
        .update({EMAIL: 'foo', name: 'bar'}),
      {
        "snowflake-sdk": {
          sql:
            'update "USERS" inner join "ORDERS" on "USERS"."ID" = "ORDERS"."USER_ID" set "EMAIL" = ?, "NAME" = ? where "USERS"."ID" = ?',
          bindings: ['foo', 'bar', 1],
        }
      }
    );
  });

  it('update method with limit mysql', () => {
    // limit works only with mysql or derrivates
    testsql(
      qb()
        .from('users')
        .where('users.id', '=', 1)
        .update({EMAIL: 'foo', name: 'bar'})
        .limit(1),
      {
        "snowflake-sdk": {
          sql:
            'update "USERS" set "EMAIL" = ?, "NAME" = ? where "USERS"."ID" = ? limit ?',
          bindings: ['foo', 'bar', 1, 1],
        }
      }
    );
  });

  it('update method without joins on postgres', () => {
    testsql(
      qb()
        .from('users')
        .where('id', '=', 1)
        .update({EMAIL: 'foo', name: 'bar'}),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = ?, "NAME" = ? where "ID" = ?',
          bindings: ['foo', 'bar', 1],
        }
      }
    );
  });

  it('update method respects raw', () => {
    testsql(
      qb()
        .from('users')
        .where('id', '=', 1)
        .update({EMAIL: raw('foo'), name: 'bar'}),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = foo, "NAME" = ? where "ID" = ?',
          bindings: ['bar', 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" + ? where "ID" = ?',
          bindings: [10, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" + ? where "ID" = ?',
          bindings: [20, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" - ? where "ID" = ?',
          bindings: [90, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" - ? where "ID" = ?',
          bindings: [20, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" + ? where "ID" = ?',
          bindings: [90, 1],
        }
      }
    );
  });

  it('Can chain increment / decrement with .update in same build-chain', () => {
    testsql(
      qb()
        .into('users')
        .where('id', '=', 1)
        .update({
          EMAIL: 'foo@bar.com',
        })
        .increment('balance', 10)
        .decrement('subbalance', 100),
      {
        "snowflake-sdk": {
          sql:
            'update "USERS" set "EMAIL" = ?, "BALANCE" = "BALANCE" + ?, "SUBBALANCE" = "SUBBALANCE" - ? where "ID" = ?',
          bindings: ['foo@bar.com', 10, 100, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = ? where "ID" = ?',
          bindings: [500, 1],
        }
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
            'update "USERS" set "BALANCE" = "BALANCE" + ?, "TIMES" = "TIMES" + ?, "VALUE" = "VALUE" - ?, "SUBVALUE" = "SUBVALUE" - ? where "ID" = ?',
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
        .update({EMAIL: 'foo@bar.com'})
        .increment({
          balance: 10,
        })
        .decrement({
          value: 50,
        })
        .clearCounters(),
      {
        "snowflake-sdk": {
          sql: 'update "USERS" set "EMAIL" = ? where "ID" = ?',
          bindings: ['foo@bar.com', 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" + ? where "ID" = ?',
          bindings: [1.23, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" - ? where "ID" = ?',
          bindings: [10, 1],
        }
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
        "snowflake-sdk": {
          sql: 'update "USERS" set "BALANCE" = "BALANCE" - ? where "ID" = ?',
          bindings: [1.23, 1],
        }
      }
    );
  });

  it('delete method', () => {
    testsql(
      qb()
        .from('users')
        .where('EMAIL', '=', 'foo')
        .delete(),
      {
        "snowflake-sdk": {
          sql: 'delete from "USERS" where "EMAIL" = ?',
          bindings: ['foo'],
        }
      }
    );
  });

  it('delete only method', () => {
    testsql(
      qb()
        .from('users', {only: true})
        .where('EMAIL', '=', 'foo')
        .delete(),
      {
        "snowflake-sdk": {
          sql: 'delete from only "USERS" where "EMAIL" = ?',
          bindings: ['foo']
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
        "snowflake-sdk": {
          sql: 'truncate "USERS"',
          bindings: [],
        }
      }
    );
  });

  it('insert get id', () => {
    testsql(
      qb()
        .from('users')
        .insert({EMAIL: 'foo'}, 'id'),
      {
        "snowflake-sdk": {
          sql: 'insert into "USERS" ("EMAIL") values (?)',
          bindings: ['foo'],
        }
      }
    );
  });

  it('wrapping', () => {
    testsql(
      qb()
        .select('*')
        .from('users'),
      {
        "snowflake-sdk": 'select * from "USERS"'
      }
    );
  });

  it('order by desc', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .orderBy('EMAIL', 'desc'),
      {
        "snowflake-sdk": 'select * from "USERS" order by "EMAIL" desc'
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
        "snowflake-sdk": 'select * from "USERS" where "FOO" is null'
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
        "snowflake-sdk": {
          sql: 'select * from "FOO" where "BAR" = ?',
          bindings: ['baz'],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "FOO" where "BAR" = ?',
          bindings: ['baz'],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "FOO" where "BAR" = ?',
          bindings: ['baz'],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "FOO" where "BAR" = ?',
          bindings: ['baz'],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "FOO" limit ? skip locked',
          bindings: [1],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "FOO" limit ? nowait',
          bindings: [1],
        }
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
        "snowflake-sdk": {
          sql:
            'insert into "ENTRIES" ("SECRET", "SEQUENCE") values (?, (select count(*) from "ENTRIES" where "SECRET" = ?))',
          bindings: [123, 123],
        }
      }
    );
  });

  it('allows left outer join with raw values', () => {
    testsql(
      qb()
        .select('*')
        .from('student')
        .leftOuterJoin('student_languages', function () {
          // @ts-ignore
          this.on('student.id', 'student_languages.student_id').andOn(
            'student_languages.code',
            raw('?', 'en_US')
          );
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "STUDENT" left outer join "STUDENT_LANGUAGES" on "STUDENT"."ID" = "STUDENT_LANGUAGES"."STUDENT_ID" and "STUDENT_LANGUAGES"."CODE" = ?',
          bindings: ['en_US'],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "TEST"',
          bindings: [],
        }
      }
    );
  });

  it('should throw warning with null call in limit', function () {
    try {
      testsql(
        qb()
          .from('test')
          // @ts-ignore
          .limit(null),
        {
          "snowflake-sdk": {
            sql: 'select * from "TEST"',
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
        "snowflake-sdk": {
          sql: 'select * from "TEST" limit ?',
          bindings: [10],
        }
      }
    );
  });

  it('should throw warning with wrong value call in offset', function () {
    try {
      testsql(
        qb()
          .from('test')
          .limit(10)
          // @ts-ignore
          .offset('$10'),
        {
          "snowflake-sdk": {
            sql: 'select * from "TEST" limit ?',
            bindings: [10],
          }
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
        "snowflake-sdk": {
          sql: 'select * from "TEST"',
          bindings: [],
        }
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
      "snowflake-sdk": {
        sql:
          'delete from "WORD" where "PAGE_ID" in (select "ID" from "PAGE" where "CHAPTER_ID" in (select "ID" from "CHAPTER" where "BOOK" = ?))',
        bindings: [1],
      }
    });

    testsql(two, {
      "snowflake-sdk": {
        sql:
          'delete from "PAGE" where "CHAPTER_ID" in (select "ID" from "CHAPTER" where "BOOK" = ?)',
        bindings: [1],
      }
    });

    testsql(three, {
      "snowflake-sdk": {
        sql: 'delete from "CHAPTER" where "BOOK" = ?',
        bindings: [1],
      }
    });
  });

  it('allows specifying the columns and the query for insert, #211', () => {
    const id = 1;
    const EMAIL = 'foo@bar.com';
    testsql(
      qb()
        .into(raw('recipients (recipient_id, EMAIL)'))
        .insert(
          qb()
            .select(raw('?, ?', [id, EMAIL]))
            .whereNotExists(function () {
              // @ts-ignore
              this.select(1)
                .from('recipients')
                .where('recipient_id', id);
            })
        ),
      {
        "snowflake-sdk": {
          sql:
            'insert into recipients (recipient_id, EMAIL) select ?, ? where not exists (select 1 from "RECIPIENTS" where "RECIPIENT_ID" = ?)',
          bindings: [1, 'foo@bar.com', 1],
        }
      }
    );
  });

  it('does an update with join on mysql, #191', () => {
    const setObj = {'tblPerson.City': 'Boonesville'};
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
      "snowflake-sdk": {
        sql:
          'update "TBLPERSON" inner join "TBLPERSONDATA" on "TBLPERSONDATA"."PERSONID" = "TBLPERSON"."PERSONID" set "TBLPERSON"."CITY" = ? where "TBLPERSONDATA"."DATAID" = ? and "TBLPERSON"."PERSONID" = ?',
        bindings: ['Boonesville', 1, 5],
      }
    });
  });

  it('does crazy advanced inserts with clever raw use, #211', () => {
    const q1 = qb()
      // @ts-ignore
      .select(raw("'user'"), raw("'user@foo.com'"))
      .whereNotExists(function () {
        // @ts-ignore
        this.select(1)
          .from('recipients')
          .where('recipient_id', 1);
      });
    const q2 = qb()
      .table('recipients')
      .insert(raw('(recipient_id, EMAIL) ?', [q1]));

    testsql(q2, {
      "snowflake-sdk": {
        sql: 'insert into "RECIPIENTS" (recipient_id, EMAIL) (select \'user\', \'user@foo.com\' where not exists (select 1 from "RECIPIENTS" where "RECIPIENT_ID" = ?))',
        bindings: [1]
      }
    });
  });

  it('supports capitalized operators', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', 'LIKE', '%test%'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "NAME" like ?',
          bindings: ['%test%'],
        }
      }
    );
  });

  it('supports NOT ILIKE operator in Snowflake', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('name', 'not ilike', '%jeff%'),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "NAME" not ilike ?',
          bindings: ['%jeff%'],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "VALUE" inner join "TABLE" on "TABLE"."ARRAY_COLUMN[1]" = ?',
          bindings: [1],
        }
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
            'select "E"."LASTNAME", "E"."SALARY", (select "avg(salary)" from "employee" where dept_no = e.dept_no) avg_sal_dept from "EMPLOYEE" as "E" where "DEPT_NO" = ?',
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
        "snowflake-sdk": {
          sql:
            'select "E"."LASTNAME", "E"."SALARY", (select "AVG(SALARY)" from "EMPLOYEE" where dept_no = e.dept_no) as "AVG_SAL_DEPT" from "EMPLOYEE" as "E" where "DEPT_NO" = ?',
          bindings: ['e.dept_no'],
        }
      }
    );
  });

  it('allows function for subselect column', () => {
    testsql(
      qb()
        .select('e.lastname', 'e.salary')
        .select(function () {
          // @ts-ignore
          this.select('avg(salary)')
            .from('employee')
            .whereRaw('dept_no = e.dept_no')
            .as('avg_sal_dept');
        })
        .from('employee as e')
        .where('dept_no', '=', 'e.dept_no'),
      {
        "snowflake-sdk": {
          sql:
            'select "E"."LASTNAME", "E"."SALARY", (select "AVG(SALARY)" from "EMPLOYEE" where dept_no = e.dept_no) as "AVG_SAL_DEPT" from "EMPLOYEE" as "E" where "DEPT_NO" = ?',
          bindings: ['e.dept_no'],
        }
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
        "snowflake-sdk": {
          sql:
            'select "E"."LASTNAME", "E"."SALARY", (select "SALARY" from "EMPLOYEE" where dept_no = e.dept_no order by "SALARY" desc limit ?) as "TOP_DEPT_SALARY" from "EMPLOYEE" as "E" where "DEPT_NO" = ?',
          bindings: [1, 'e.dept_no'],
        }
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
      "snowflake-sdk": {
        sql:
          'select * from "PLACES" where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1, 2, 3]],
      }
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
        "snowflake-sdk": {
          sql:
            'select * from "ACCOUNTS" natural full join table1 where "ID" = ?',
          bindings: [1],
        }
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
        "snowflake-sdk": {
          sql:
            'select * from "ACCOUNTS" inner join "TABLE1" on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))',
        }
      }
    );
  });

  it('allows join "using"', () => {
    testsql(
      qb()
        .select('*')
        .from('accounts')
        .innerJoin('table1', function () {
          // @ts-ignore
          this.using('id');
        }),
      {
        "snowflake-sdk": {
          sql: 'select * from "ACCOUNTS" inner join "TABLE1" using ("ID")',
        }
      }
    );

    testsql(
      qb()
        .select('*')
        .from('accounts')
        .innerJoin('table1', function () {
          // @ts-ignore
          this.using(['id', 'test']);
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "ACCOUNTS" inner join "TABLE1" using ("ID", "TEST")',
        }
      }
    );
  });

  it('allows sub-query function on insert, #427', () => {
    testsql(
      qb()
        .into('votes')
        .insert(function () {
          // @ts-ignore
          this.select('*')
            .from('votes')
            .where('id', 99);
        }),
      {
        "snowflake-sdk": {
          sql: 'insert into "VOTES" select * from "VOTES" where "ID" = ?',
          bindings: [99],
        }
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
        "snowflake-sdk": {
          sql: 'insert into "VOTES" select * from "VOTES" where "ID" = ?',
          bindings: [99],
        }
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
        "snowflake-sdk": {
          sql:
            'select "A"."NID" as "ID" from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on "A"."X" = "B"."X"',
          bindings: [],
        }
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
        "snowflake-sdk": {
          sql:
            'insert into "ENTRIES" ("SECRET", "SEQUENCE") values (?, (select count(*) from "ENTRIES" where "SECRET" = ?))',
          bindings: [123, 123],
        }
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
        "snowflake-sdk": {
          sql: 'select ? from (select ?, "BAR")',
          bindings: ['outer raw select', 'inner raw select'],
        }
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
        "snowflake-sdk": {
          sql:
            'select ?, "G"."F" from (select ? as f) as "G" where "G"."SECRET" = ?',
          bindings: ['outer raw select', 'inner raw select', 123],
        }
      }
    );
  });

  it.skip('escapes queries properly, #737', () => {
    testsql(
      qb()
        .select('id","name', 'id"name')
        .from('test"'),
      {
        "snowflake-sdk": {
          sql: 'select "ID","NAME", "ID""NAME" from "test"""',
          bindings: [],
        }
      }
    );
  });

  it('has a modify method which accepts a function that can modify the query', () => {
    // arbitrary number of arguments can be passed to ".modify(queryBuilder, ...)",
    // builder is bound to "this"
    const withBars = function (queryBuilder, table, fk) {
      // @ts-ignore
      if (!this || this !== queryBuilder) {
        throw 'Expected query builder passed as first argument and bound as "this" context';
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
        "snowflake-sdk": {
          sql:
            'select "FOO_ID", "BARS".* from "FOOS" left join "BARS" on "FOOS"."BAR_ID" = "BARS"."ID"',
        }
      }
    );
  });

  it('Allows for empty where #749', () => {
    testsql(
      qb()
        .select('foo')
        .from('tbl')
        .where(() => {
        }),
      {
        "snowflake-sdk": 'select "FOO" from "TBL"'
      }
    );
  });

  it.skip('escapes single quotes properly', () => {
    testquery(
      qb()
        .select('*')
        .from('users')
        .where('last_name', "O'Brien"),
      {
        "snowflake-sdk": `select * from "USERS" where "LAST_NAME" = 'O\\'Brien'`
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
        "snowflake-sdk": 'select * from "PLAYERS" where "NAME" = \'Gerald "Ice" Williams\'',
      }
    );
  });

  it.skip('escapes backslashes properly', () => {
    testquery(
      qb()
        .select('*')
        .from('files')
        .where('path', 'C:\\test.txt'),
      {
        "snowflake-sdk": 'select * from "FILES" where "PATH" = \'C:\\\\test.txt\'',
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" inner join "PHOTOS" on "PHOTOS"."ID" = 0',
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" inner join "PHOTOS" on "PHOTOS"."ID" > 0',
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "BIRTHDAY" >= ?',
          bindings: [date],
        }
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
        "snowflake-sdk": {
          sql: 'select * from "USERS" where birthday >= ?',
          bindings: [date],
        }
      }
    );
  });

  it('#965 - .raw accepts Array and Non-Array bindings', () => {
    const expected = (fieldName, expectedBindings) => ({
      "snowflake-sdk": {
        sql: 'select * from "USERS" where ' + fieldName + ' = ?',
        bindings: expectedBindings,
      }
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
        "snowflake-sdk": `select * from "USERS" where updtime = '` + sqlUpdTime + "'"
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
          EMAIL: 'foo',
          id: 2,
        }),
      {
        "snowflake-sdk": {
          sql:
            'select * from "USERS" where "ID" = ? or ("EMAIL" = ? and "ID" = ?)',
          bindings: [1, 'foo', 2],
        }
      }
    );
  });

  it('#1228 Named bindings', () => {
    testsql(
      qb()
        .select('*')
        .from('users')
        .whereIn('id', raw('select (:test)', {test: [1, 2, 3]})),
      {
        "snowflake-sdk": {
          sql: 'select * from "USERS" where "ID" in (select (?))',
          bindings: [[1, 2, 3]],
        }
      }
    );

    const namedBindings = {
      name: 'users.name',
      thisGuy: 'Bob',
      otherGuy: 'Jay',
    };
    //Had to do it this way as the 'raw' statement's .toQuery is called before testsql, meaning mssql and other dialects would always get the output of qb() default client
    //as MySQL, which means testing the query per dialect won't work. [users].[name] would be "USERS"."NAME" for mssql which is incorrect.
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
      'select * from "USERS" where "USERS"."NAME" = ? or "USERS"."NAME" = ?'
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
        "snowflake-sdk": {
          sql:
            'insert into "USERS" ("ID", "NAME", "OCCUPATION") values (DEFAULT, ?, DEFAULT), (?, DEFAULT, ?)',
          bindings: ['test', 1, 'none'],
        }
      }
    );
  });

  it('#1402 - raw should take "not" into consideration in querybuilder', () => {
    testsql(
      qb()
        .from('TESTTABLE')
        .whereNot(raw('is_active')),
      {
        "snowflake-sdk": {
          sql: 'select * from "TESTTABLE" where not is_active',
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
          "snowflake-sdk": {
            sql: '',
            bindings: [],
          }
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

  it.skip('query \\\\? escaping', () => {
    testquery(
      qb()
        .select('*')
        .from('users')
        .where('id', '=', 1)
        .whereRaw('?? \\? ?', ['jsonColumn', 'jsonKey?']),
      {
        "snowflake-sdk":
          `select * from "USERS" where "ID" = 1 and "jsonColumn" ? 'jsonKey?'`
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
        "snowflake-sdk": 'select * from "USERS" where "ID" \\? ?',
      }
    );
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '?|', 1),
      {
        "snowflake-sdk": 'select * from "USERS" where "ID" \\?| ?',
      }
    );
    testsql(
      qb()
        .select('*')
        .from('users')
        .where('id', '?&', 1),
      {
        "snowflake-sdk": 'select * from "USERS" where "ID" \\?& ?',
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
        "snowflake-sdk":
          'with "WITHCLAUSE" as (select "FOO" from "USERS") select * from "WITHCLAUSE"'
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
          'with "WITHCLAUSE" as (select "FOO" from "USERS") insert into "USERS" select * from "withClause"'
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
          {EMAIL: 'thisMail', name: 'sam'},
          {EMAIL: 'thatMail', name: 'jack'},
        ])
        .into('users'),
      {
        "snowflake-sdk": {
          sql:
            'with "WITHCLAUSE" as (select "FOO" from "USERS" where "NAME" = ?) insert into "USERS" ("EMAIL", "NAME") values (?, ?), (?, ?)',
          bindings: ['bob', 'thisMail', 'sam', 'thatMail', 'jack'],
        }
      }
    );
  });

  it.skip("wrapped 'with' clause update", () => {
    testsql(
      qb()
        .with('withClause', function () {
          // @ts-ignore
          this.select('foo').from('users');
        })
        .update({foo: 'updatedFoo'})
        .where('EMAIL', '=', 'foo')
        .from('users'),
      {
        "snowflake-sdk":
          'with "withClause" as (select "FOO" from "USERS") update "USERS" set "FOO" = ? where "EMAIL" = ?'
      }
    );
  });

  it("wrapped 'with' clause delete", () => {
    testsql(
      qb()
        .with('withClause', function () {
          // @ts-ignore
          this.select('EMAIL').from('users');
        })
        .del()
        .where('foo', '=', 'updatedFoo')
        .from('users'),
      {
        "snowflake-sdk":
          'with "WITHCLAUSE" as (select "EMAIL" from "USERS") delete from "USERS" where "FOO" = ?'
      }
    );
  });

  it("raw 'with' clause", () => {
    testsql(
      qb()
        .with('withRawClause', raw('select "FOO" as "BAZ" from "USERS"'))
        .select('*')
        .from('withRawClause'),
      {
        "snowflake-sdk":
          'with "WITHRAWCLAUSE" as (select "FOO" as "BAZ" from "USERS") select * from "WITHRAWCLAUSE"'
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
        "snowflake-sdk":
          'with "FIRSTWITHCLAUSE" as (select "FOO" from "USERS"), "SECONDWITHCLAUSE" as (select "BAR" from "USERS") select * from "SECONDWITHCLAUSE"'
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
        "snowflake-sdk":
          'with "WITHCLAUSE" as (with "WITHSUBCLAUSE" as ((select "FOO" from "USERS") as "BAZ") select * from "WITHSUBCLAUSE") select * from "WITHCLAUSE"'
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
              'select "FOO" as "BAZ" from "USERS" where "BAZ" > ? and "BAZ" < ?',
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
        "snowflake-sdk": {
          sql:
            'with "WITHCLAUSE" as (with "WITHSUBCLAUSE" as (select "FOO" as "BAZ" from "USERS" where "BAZ" > ? and "BAZ" < ?) select * from "WITHSUBCLAUSE") select * from "WITHCLAUSE" where "ID" = ?',
          bindings: [1, 20, 10],
        }
      }
    );
  });

  it('should return dialect specific sql and bindings with  toSQL().toNative()', () => {
    testNativeSql(
      qb()
        .from('table')
        .where('isIt', true),
      {
        "snowflake-sdk": {
          sql: 'select * from "TABLE" where "ISIT" = ?',
          bindings: [true],
        }
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
        "snowflake-sdk":
          'with "FIRSTWITHCLAUSE" as (with "FIRSTWITHSUBCLAUSE" as ((select "FOO" from "USERS") as "FOZ") select * from "FIRSTWITHSUBCLAUSE"), "SECONDWITHCLAUSE" as (with "SECONDWITHSUBCLAUSE" as ((select "BAR" from "USERS") as "BAZ") select * from "SECONDWITHSUBCLAUSE") select * from "SECONDWITHCLAUSE"'
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
        "snowflake-sdk":
          'with recursive "FIRSTWITHCLAUSE" as (with recursive "FIRSTWITHSUBCLAUSE" as ((select "FOO" from "USERS") as "FOZ") select * from "FIRSTWITHSUBCLAUSE"), "SECONDWITHCLAUSE" as (with recursive "SECONDWITHSUBCLAUSE" as ((select "BAR" from "USERS") as "BAZ") select * from "SECONDWITHSUBCLAUSE") select * from "SECONDWITHCLAUSE"'
      }
    );
  });

  describe.skip('#2263, update / delete queries in with syntax', () => {
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
          "snowflake-sdk": `with "update1" as (update "ACCOUNTS" set "NAME" = 'foo') select * from "ACCOUNTS"`,
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
          "snowflake-sdk": `with "update1" as (update "ACCOUNTS" set "NAME" = 'foo') select * from "ACCOUNTS"`,
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
          "snowflake-sdk": `with "update1" as (update "ACCOUNTS" set "NAME" = 'foo') select * from "ACCOUNTS"`,
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
          "snowflake-sdk": `with "delete1" as (delete from "ACCOUNTS" where "ID" = 1) select * from "ACCOUNTS"`,
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
          "snowflake-sdk": `with "delete1" as (delete from "ACCOUNTS" where "ID" = 1) select * from "ACCOUNTS"`
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
          "snowflake-sdk": `with "delete1" as (delete from "ACCOUNTS" where "ID" = 1) select * from "ACCOUNTS"`,
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
          "snowflake-sdk": `with "updated_group" as (update "group" set "group_name" = 'bar' where "group_id" = 1 returning "group_id") update "user" set "NAME" = 'foo' where "group_id" = 1`,
        }
      );
    });
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
        'Empty .update() call detected! Update data does not contain any values to update. This will result in a faulty query.'
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

  describe.skip('knex.ref()', () => {
    it('Can be used as parameter in where-clauses', () => {
      testquery(
        qb()
          .table('sometable')
          .where('sometable.column', ref('someothertable.someothercolumn'))
          .select(),
        {
          "snowflake-sdk":
            'select * from "sometable" where "sometable"."column" = "someothertable"."someothercolumn"'
        }
      );
    });

    it('Can use .as() for alias', () => {
      testquery(
        qb()
          .table('sometable')
          .select(['one', ref('sometable.two').as('Two')]),
        {
          "snowflake-sdk": 'select "one", "sometable"."two" as "Two" from "sometable"'
        }
      );
    });
  });

  it('Can call knex.select(0)', () => {
    testquery(qb().select(0), {
      pg: 'select 0',
      "snowflake-sdk": 'select 0'
    });
  });

  it('should warn to user when use ".returning()" function in MySQL', () => {
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
          .insert({EMAIL: 'foo'})
          .returning('id'),
        {
          "snowflake-sdk": {
            sql: 'insert into "USERS" ("EMAIL") values (?)',
            bindings: ['foo'],
          },
        },
        {
          "snowflake-sdk": snowflakeClientForWarnings,
        }
      );
    }).toThrow(Error);
  });

  it('should warn to user when use ".returning()" function in SQLite3', () => {
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
  });

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
        "snowflake-sdk":
          'select "DEPARTMENTS".*, "TRAINEE_CNTS"."COUNT" as "TRAINEE_CNT" from "FOO"."DEPARTMENTS" inner join (select "DEPARTMENT_ID", count(*) from "FOO"."TRAINEES" group by "DEPARTMENT_ID") as "TRAINEE_CNTS" on "TRAINEE_CNTS"."DEPARTMENT_ID" = "DEPARTMENTS"."ID"'
      }
    );
  });

  it.skip('join with onVal andOnVal orOnVal', () => {
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
        "snowflake-sdk": {
          sql:
            'select "P"."ID" as "ID", "P"."POST_STATUS" as "STATUS", "P"."POST_TITLE" as "NAME", "PRICE"."META_VALUE" as "PRICE", "P"."POST_DATE_GMT" as "CREATEDAT", "P"."POST_MODIFIED_GMT" as "UPDATEDAT" from "WP_POSTS" as "P" left join "WP_POSTMETA" as "PRICE" on "P"."ID" = "PRICE"."POST_ID" and ("PRICE"."META_KEY" = ? and "PRICE_META_KEY" = ?) or ("PRICE_META"."KEY" = ?)',
          bindings: ['_regular_price', '_regular_price', '_regular_price'],
        }
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
        "snowflake-sdk": {
          sql:
            'select "P"."ID" as "ID", "P"."post_status" as "status", "P"."post_title" as "NAME", "price"."meta_value" as "price", "P"."post_date_gmt" as "createdAt", "P"."post_modified_gmt" as "updatedAt" from "wp_posts" as "P" left join "wp_postmeta" as "price" on ("price"."meta_key" = ? and "price_meta_key" = ?) or ("price_meta"."key" = ?)',
          bindings: ['_regular_price', '_regular_price', '_regular_price']
        }
      }
    );
  });
});
