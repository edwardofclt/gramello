import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('seeds all approved USDA foods idempotently, preserves fresher rows, and indexes mutations', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    const seed = execFileSync(process.execPath, ['scripts/seed-usda-core.mjs'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
    db.exec(seed);
    const expected = JSON.parse(readFileSync('data/food-catalog/usda-core.json', 'utf8')).length;
    expect(db.prepare("SELECT count(*) count FROM foods WHERE id LIKE 'usda-%'").get()).toMatchObject({ count: expected });
    db.exec("UPDATE foods SET name='Fresh canonical banana',calories=99,checked_at='2026-09-25' WHERE id='usda-173944'");
    db.exec(seed);
    expect(db.prepare("SELECT name,calories FROM foods WHERE id='usda-173944'").get()).toEqual(expect.objectContaining({ name: 'Fresh canonical banana', calories: 99 }));
    expect(db.prepare("SELECT count(*) count FROM food_search WHERE food_search MATCH 'canonical'").get()).toMatchObject({ count: 1 });
    db.exec("DELETE FROM foods WHERE id='usda-173944'");
    expect(db.prepare("SELECT count(*) count FROM food_search WHERE food_search MATCH 'canonical'").get()).toMatchObject({ count: 0 });
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM food_search WHERE food_search MATCH 'rice'").all();
    expect(JSON.stringify(plan)).toContain('VIRTUAL TABLE INDEX');
  } finally { db.close(); }
});
