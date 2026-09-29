import lexicon from './lexicon.generated';

// Small, reviewable vocabulary. These are lexical aliases, never nutrition equivalences.
export const phraseAliases: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmcdonalds\b/g, 'mcdonald s'], [/\bchickfila\b/g, 'chick fil a'],
  [/\bchick fil a s\b/g, 'chick fil a'],
  [/\balfresco\b/g, 'al fresco'],
  [/\bcookout\b/g, 'cook out'], [/\bin n out\b/g, 'in n out'],
  [/\byoghurt\b/g, 'yogurt'], [/\byoghurts\b/g, 'yogurt'],
  [/\bgarbanzo beans?\b/g, 'chickpeas'], [/\bscallions?\b/g, 'green onions'],
  [/\baubergines?\b/g, 'eggplant'], [/\bcourgettes?\b/g, 'zucchini'],
  [/\bkiwi fruits?\b/g, 'kiwifruit'], [/\bprawns?\b/g, 'shrimp'],
  [/\blow fat\b/g, 'lowfat'], [/\bnon fat\b/g, 'nonfat'], [/\bzero sugar\b/g, 'sugar free'],
];
export const singularWords: Record<string, string> = {
  ...lexicon.plurals,
  eggs:'egg', apples:'apple', bananas:'banana', oranges:'orange', breasts:'breast',
  potatoes:'potato', tomatoes:'tomato', strawberries:'strawberry', blueberries:'blueberry',
  raspberries:'raspberry', blackberries:'blackberry', cherries:'cherry', peaches:'peach',
  pears:'pear', mangos:'mango', mangoes:'mango', grapes:'grape', avocados:'avocado', carrots:'carrot', onions:'onion',
  beans:'bean', peas:'pea', chickpeas:'chickpea', lentils:'lentil', oats:'oat',
  almonds:'almond', walnuts:'walnut', peanuts:'peanut', cashews:'cashew',
  mushrooms:'mushroom', cucumbers:'cucumber', peppers:'pepper',
  tortillas:'tortilla', pancakes:'pancake', waffles:'waffle', noodles:'noodle',
  sandwiches:'sandwich', burgers:'burger', nuggets:'nugget', tenders:'tender',
  yogurts:'yogurt', biscuits:'biscuit', cookies:'cookie', crackers:'cracker',
};
export const spellingVocabulary = new Set([
  ...Object.keys(singularWords), ...Object.values(singularWords),
  'chicken','breast','rice','brown','white','cooked','raw','grilled','roasted',
  'scrambled','boiled','bread','butter','peanut','yogurt','greek','cheese','milk',
  'salmon','tuna','beef','pork','turkey','broccoli','spinach','lettuce','quinoa',
  'coffee','chocolate','vanilla','oatmeal','pasta','pizza','avocado','strawberry',
  'green','toasted','unroasted','unsweetened','sweetened','unsalted','salted','canned','fresh',
  'frozen','dried','powdered','unbreaded','breaded','skinless','boneless','whole','lowfat','nonfat',
]);

// Semantic scope is deliberately narrow: fresh is not a synonym for raw in
// cooked meat, packaged food or recipe names. Every other query term remains.
export const freshProduceTerms = new Set([
  'apple','apricot','avocado','banana','blackberry','blueberry','cherry','cranberry',
  'date','fig','grape','grapefruit','guava','kiwi','kiwifruit','lemon','lime','lychee',
  'mango','melon','nectarine','orange','papaya','peach','pear','persimmon','pineapple',
  'plum','pomegranate','raspberry','strawberry','watermelon',
  'artichoke','arugula','asparagus','beet','broccoli','cabbage','carrot','cauliflower',
  'celery','chard','cucumber','eggplant','endive','fennel','kale','leek','lettuce',
  'mushroom','okra','onion','parsnip','pea','pepper','potato','pumpkin','radish',
  'rutabaga','shallot','spinach','squash','tomato','turnip','watercress','zucchini',
  'basil','chive','cilantro','coriander','dill','mint','parsley','rosemary','sage',
  'tarragon','thyme',
]);
export const freshProduceQualifiers = new Set([
  'fresh','raw','whole','sweet','sour','red','green','yellow','white','purple',
  'black','golden','ripe','leaf','leaves','fruit',
]);
