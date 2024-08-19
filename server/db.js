import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

const dbPromise = open({
  filename: './database.db',
  driver: sqlite3.Database
});

export default dbPromise;