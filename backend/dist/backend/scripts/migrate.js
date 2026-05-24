import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const migrationsDir = path.resolve('./db/migrations');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for migrations');
}
const client = new Client({ connectionString: databaseUrl });
async function main() {
    await client.connect();
    await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
        const name = file;
        const { rows } = await client.query('SELECT 1 FROM migrations WHERE name = $1', [name]);
        if (rows.length > 0) {
            continue;
        }
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`Applying migration ${name}`);
        await client.query('BEGIN');
        try {
            await client.query(sql);
            await client.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    }
    console.log('Migrations complete');
    await client.end();
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
