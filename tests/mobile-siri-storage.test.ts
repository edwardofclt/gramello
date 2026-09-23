import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { testDatabase } from './helpers/local-sqlite';
import { createLocalRepository } from '../mobile/src/local/repository';
import { parseArchive } from '../mobile/src/local/records';
import { mealFood, scaleFood, type Food, type Ingredient } from '../lib/meals';

// Exercise the actual native writer against the JavaScript repository contract.
// Linux runs the JS suite; Siri CI runs this integration on macOS with Xcode.
it.runIf(process.platform === 'darwin')('Siri entries match app recipe math and round-trip through backup, diary, water, and deletion', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'gramello-siri-storage-'));
  const databasePath = path.join(directory, 'diary.sqlite');
  const { db, raw } = testDatabase(databasePath);
  try {
    const catalog = { getFood: async () => null, search: async () => [], barcode: async () => null };
    const repository = await createLocalRepository(db, catalog);
    const base: Food = { id: 'test', name: 'Food', source: 'Test', servingLabel: '100 g', servingGrams: 100, calories: 200, protein: 20, carbs: 10, fat: 5 };
    const ingredients: Ingredient[] = [
      { food: base, quantity: 6, unit: 'ounces' },
      { food: { ...base, nutritionBasis: 'serving', servingGrams: 80 }, quantity: 120, unit: 'grams' },
      { food: { ...base, nutritionBasis: 'serving', servingGrams: null }, quantity: 0.5, unit: 'serving' },
      { food: { ...base, nutritionBasis: '100ml', nutritionUnit: 'ml', servingMl: 250, servingGrams: null }, quantity: 8, unit: 'fluid-ounces' },
      { food: { ...base, nutritionUnit: 'ml', servingMl: 200, servingGrams: 0 }, quantity: 0.5, unit: 'serving' },
    ];
    const meals = [];
    for (const ingredient of ingredients) {
      meals.push((await repository.saveMeal({ name: 'Test recipe', ingredients: [ingredient], totalGrams: 600, servingGrams: 150 })).meal);
    }
    meals.push((await repository.saveMeal({ name: 'Estimated yield', ingredients: [{ food: base, quantity: 300, unit: 'grams' }], totalGrams: null, servingGrams: 75 })).meal);
    const today = '2026-03-08', yesterday = '2026-03-07';
    const main = path.join(directory, 'main.swift');
    writeFileSync(main, `
import Foundation
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let now = ISO8601DateFormatter().date(from: "2026-03-09T03:30:00Z")!
let yesterday = ISO8601DateFormatter().date(from: "2026-03-07T17:00:00Z")!
let zone = TimeZone(identifier: "America/New_York")!
for meal in try DiaryActions.savedMeals(databaseURL: url) {
    _ = try DiaryActions.logSavedMeal(databaseURL: url, id: meal.id, servings: 1.5, meal: .lunch, now: yesterday, timeZone: zone)
}
_ = try DiaryActions.repeatYesterday(databaseURL: url, meal: .lunch, now: now, timeZone: zone)
_ = try DiaryActions.logWater(databaseURL: url, amount: 16, unit: .fluidOunces, now: now, timeZone: zone)
try WidgetPublisher.publish(databaseURL: url, directory: url.deletingLastPathComponent(), now: now, timeZone: zone)
`);
    const sources = fileURLToPath(new URL('../mobile/native/siri/Sources/GramelloSiri/', import.meta.url));
    const executable = path.join(directory, 'diary-actions');
    execFileSync('xcrun', ['swiftc', ...readdirSync(sources).filter(name => name.endsWith('.swift')).map(name => path.join(sources, name)), main, '-o', executable], { timeout: 60000, stdio: 'pipe' });
    execFileSync(executable, [databasePath], { timeout: 10000, stdio: 'pipe' });
    // Both native Siri publication and Android's repository reader use one wire contract.
    expect(JSON.parse(readFileSync(path.join(directory,'summary.json'),'utf8'))).toEqual(
      await repository.getWidgetSummary(new Date('2026-03-09T03:30:00Z'),'America/New_York'));

    const entries = (await repository.getDay(today)).entries;
    expect(entries).toHaveLength(meals.length);
    for (const meal of meals) {
      const entry = entries.find(value => value.sourceId === `meal-${meal.id}`)!;
      const expected = scaleFood(mealFood(meal), 1.5, 'serving')!;
      for (const key of ['calories', 'protein', 'carbs', 'fat', 'grams'] as const) expect(entry[key]).toBeCloseTo(expected[key]!, 8);
      expect(entry).toMatchObject({ quantity: 1.5, unit: 'serving', meal: 'Lunch', source: 'My meals', verified: false });
    }
    const originals = (await repository.getDay(yesterday)).entries;
    expect(originals).toHaveLength(meals.length);
    expect(entries.every(entry => originals.every(original => original.id !== entry.id))).toBe(true);
    const water = await repository.getWaterDay(today);
    expect(water.totalMl).toBe(473.176473);
    const archive = await repository.exportArchive();
    expect(parseArchive(JSON.stringify(archive)).records).toHaveLength(meals.length * 3 + 1);
    await repository.importArchive(JSON.stringify(archive));
    expect((await repository.getDay(today)).entries).toEqual(entries);
    await repository.removeEntry(entries[0].id);
    await repository.removeWater(water.entries[0].id);
    expect((await repository.getDay(today)).entries).toHaveLength(meals.length - 1);
    expect((await repository.getWaterDay(today)).entries).toHaveLength(0);
  } finally {
    raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 90000);

it.runIf(process.platform === 'darwin')('native widget publication agrees with repository validation for corrupt stored rows', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'gramello-widget-validation-'));
  const databasePath = path.join(directory, 'diary.sqlite');
  const { db, raw } = testDatabase(databasePath);
  try {
    const repository = await createLocalRepository(db, { getFood: async () => null, search: async () => [], barcode: async () => null });
    const main = path.join(directory, 'main.swift');
    writeFileSync(main, `
import Foundation
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let now = ISO8601DateFormatter().date(from: "2026-03-09T03:30:00Z")!
let zone = TimeZone(identifier: "America/New_York")!
do {
    _ = try WidgetPublisher.read(databaseURL: url, now: now, timeZone: zone)
    print("ready")
} catch { print("invalid") }
try WidgetPublisher.publish(databaseURL: url, directory: url.deletingLastPathComponent(), now: now, timeZone: zone)
print(try WidgetSnapshot.load(from: url.deletingLastPathComponent().appendingPathComponent("summary.json")).status)
`);
    const sources = fileURLToPath(new URL('../mobile/native/siri/Sources/GramelloSiri/', import.meta.url));
    const executable = path.join(directory, 'widget-validation');
    execFileSync('xcrun', ['swiftc', ...readdirSync(sources).filter(name => name.endsWith('.swift')).map(name => path.join(sources, name)), main, '-o', executable], { timeout: 60000, stdio: 'pipe' });
    const date = '2026-03-08';
    const entry = { id:'a',date,createdAt:'2026-03-08T12:00:00.000Z',meal:'Lunch',name:'Soup',source:'My foods',quantity:1,unit:'serving',grams:null,calories:300,protein:20,carbs:40,fat:5 };
    const water = { id:'a',date,createdAt:entry.createdAt,amountMl:250 };
    const cases: {name:string;kind:string;value:Record<string,unknown>;date:string|null;id?:string;valid:boolean}[] = [
      {name:'valid entry',kind:'entry',value:entry,date,valid:true},
      {name:'valid water',kind:'water',value:water,date,valid:true},
      {name:'dated nutrition goals',kind:'goals',id:'default',value:{calories:2400,protein:180,carbs:250,fat:70},date,valid:false},
      {name:'dated water goals',kind:'waterGoal',id:'default',value:{goalMl:2000,unit:'ml'},date,valid:false},
    ];
    for (const [kind, value] of [['entry',entry],['water',water]] as const) {
      for (const field of Object.keys(value)) {
        const missing: Record<string,unknown> = {...value}; delete missing[field];
        cases.push({name:`${kind} missing ${field}`,kind,value:missing,date,valid:false});
      }
      for (const id of ['', 'x'.repeat(201)]) cases.push({name:`${kind} invalid ID length ${id.length}`,kind,id,value:{...value,id},date,valid:false});
      for (const createdAt of ['invalid','2026-02-30T12:00:00Z','2026-03-08T24:00:00Z']) {
        cases.push({name:`${kind} invalid timestamp ${createdAt}`,kind,value:{...value,createdAt},date,valid:false});
      }
      for (const createdAt of ['2026-03-08T12:00Z','2026-03-08T12:00:00+0500','2026-03-08T12:00:00.123456+05:00']) {
        cases.push({name:`${kind} supported timestamp ${createdAt}`,kind,value:{...value,createdAt},date,valid:true});
      }
    }
    for (const [field,value] of Object.entries({unit:'cups',meal:'Brunch',quantity:0,grams:-1,calories:1e13,name:'',source:'x'.repeat(201),brand:null,sourceId:null,sourceUrl:null,verified:null,servingLabel:null})) {
      cases.push({name:`invalid entry ${field}`,kind:'entry',value:{...entry,[field]:value},date,valid:false});
    }
    for (const test of cases) {
      raw.exec('DELETE FROM records');
      raw.prepare('INSERT INTO records VALUES(?,?,?,?)').run(test.kind,test.id ?? 'a',test.date,JSON.stringify(test.value));
      const summary = repository.getWidgetSummary(new Date('2026-03-09T03:30:00Z'),'America/New_York');
      if (test.valid) await expect(summary,test.name).resolves.toMatchObject({status:'ready'});
      else await expect(summary,test.name).rejects.toThrow();
      expect(execFileSync(executable,[databasePath],{timeout:10000,encoding:'utf8'}).trim(),test.name)
        .toBe(test.valid ? 'ready\nready' : 'invalid\nunavailable');
    }
  } finally {
    raw.close(); rmSync(directory,{recursive:true,force:true});
  }
}, 90000);
