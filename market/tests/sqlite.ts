import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { D1Database, D1Statement } from '../src/types.ts';
/** Actual SQLite engine; only the D1 asynchronous binding wrapper is emulated. */
export function sqliteDatabase():D1Database & {sql:DatabaseSync} {
 const sql=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 return {sql,prepare(query:string):D1Statement {
  let args:unknown[]=[];
  return {bind(...v){args=v;return this;},async first<T>(){return (sql.prepare(query).get(...args as (string|number|null)[])??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args as (string|number|null)[]) as T[]};},async run(){return sql.prepare(query).run(...args as (string|number|null)[]);}};
 }};
}
