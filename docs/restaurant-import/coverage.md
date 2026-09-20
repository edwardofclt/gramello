# Restaurants within ten miles of ZIP 29707

Audit date: **2026-09-20**. The inventory contains **241 chains and chain candidates**, with 137 supported by current first-party or property-owner directory pages, 100 mapped candidates awaiting current-location or chain-identity checks, and 4 historical/unresolved entries. **This is not a proven exhaustive census.**

**150 catalogs / 42,529 serving records** currently have a matching inventory entry. An imported catalog establishes nutrient provenance; it does not establish that every item is currently offered at a nearby branch. `coverage.json` links each catalog filename to its chain and preserves all location evidence.

## Radius and evidence

The radius is ten straight-line miles from **34.987552, −80.858188**, the Census ZCTA 29707 internal representative point in the [2025 national Gazetteer](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip). ZIP codes cover areas rather than one point. This is a reproducible center proxy, not the user's home, an exact polygon centroid, a driving distance, or a buffer around the ZIP boundary.

Distances use the haversine formula with Earth radius 3,958.7613 miles. Discovery queried 529 mapped restaurant/fast-food/cafe/ice-cream objects within 16,093.44 meters using the Overpass query recorded in JSON. The map service returned data dated **2026-07-15T15:22:01Z**, older than the research date. Coordinates from map POIs, official locator structured data, and Census address geocoding are distinguished. Shopping-center reference points are explicitly approximate, sometimes shared by several nearby storefronts; distances are reported for discovery, not navigation. Locations within the outer quarter-mile are flagged for boundary review.

Coverage includes national and regional restaurants, cafes, pizza, dessert shops, and candidate local multi-location brands. Food-service kiosks are included where mapped or listed. Grocery-only packaged foods and known single-location independents are outside this audit. Some regional candidates still need identity checks, and some shopping-center tenant lists may include recently signed tenants before opening. A current primary listing is stronger evidence than a map point, but it is not a live guarantee of operation.

Primary shopping directories were cross-checked at [RedStone](https://www.redstoneshopping.com/), [Blakeney](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center), [StoneCrest](https://shopstonecrest.com/directory/), [Ballantyne campus](https://www.goballantyne.com/things-to-do/restaurant), [Ballantyne Village](https://www.ballantynevillage.com/directory/), [Carolina Place](https://www.carolinaplace.com/en/directory/), [Waverly](https://www.waverlyclt.com/directory/), and [Rea Farms](https://www.inventrustproperties.com/property/rea-farms/). Brand locators and their supporting addresses are recorded per location.

Map attribution: **© OpenStreetMap contributors**, available under [ODbL 1.0](https://www.openstreetmap.org/copyright). Census geography/address matching is publicly available federal data.

## Nutrition and gaps

Imported foods retain source URLs, retrieval date, serving descriptions, and complete numeric calories/protein/carbohydrate/fat values. Official restaurant sources and explicitly identified nutrition-database records support the app's Verified provenance indicator. Custom user entries are unverified. Verified does not mean independent laboratory testing, current menu availability, or perfect per-plate accuracy.

`no_catalog_imported` means there is no committed catalog for that candidate. It does **not** assert the chain never publishes nutrition. Unsuccessful source probes and row exclusions are documented in the regional/national/supplemental reports. A catalog can be partial when the publisher omits macros, prints inequalities, or has inconsistent values. Missing values were not guessed to fill coverage gaps.

Known stale evidence is retained for Menchie's (RedStone now lists Handel's), B.Good (absent from current Ballantyne Village directory), Nestlé Toll House Cafe (absent from current Carolina Place directory), and Red Rocks Cafe (RedStone site replaced by Aroma). These entries are not counted as confirmed current locations. Kura Sushi and Palm Berries have conflicting opening labels in the StoneCrest directory; check their per-location notes.

The user requested all nearby chains. The current deliverable substantially expands coverage, but that exhaustive goal remains limited by incomplete public location data and unavailable full nutrition for numerous regional/local brands. The explicit missing-catalog table below is the follow-up queue, rather than an invented claim that every chain/menu was imported.

## Audited inventory

Status: **Primary** = current primary location/directory evidence; **Map candidate** = mapped inside the radius, current operation/chain identity still needs checking; **Historical** = unresolved stale listing. Distance is the closest known coordinate, which can differ from the linked primary location; JSON retains each individual distance and coordinate method. Source audit links describe exactly what was checked; a missing catalog is not an assertion that no nutrition exists.

| Chain | Location evidence | Closest mapped miles | Nutrition |
| --- | --- | ---: | --- |
| 131 MAIN | [Primary](https://www.131-main.com/blakeney/) | 4.33 | [Source gap audit](regional-source-audit.json) |
| 521 BBQ & Grill | [Map candidate](https://www.openstreetmap.org/node/4606085313) | 3.72 | [Source gap audit](regional-source-audit.json) |
| Akahana Asian Bistro Bar & Sushi | [Map candidate](https://www.openstreetmap.org/node/5264851410) | 6.82 | [Source gap audit](candidate-source-audit.json) |
| Akropolis Cafe | [Map candidate](https://www.openstreetmap.org/node/5363922481) | 8.70 | [Source gap audit](candidate-source-audit.json) |
| Amelie's French Bakery and Cafe | [Map candidate](https://www.openstreetmap.org/node/3313321873) | 6.84 | [Source gap audit](candidate-source-audit.json) |
| Andy's Frozen Custard | [Map candidate](https://www.openstreetmap.org/way/981273390) | 3.66 | [206 servings](../../data/restaurant-foods/andys-frozen-custard.json) |
| Applebee's | [Primary](https://restaurants.applebees.com/en-us/sc/rock-hill/2227-dave-lyle-boulevard-87084) | 6.88 | [438 servings](../../data/restaurant-foods/applebees.json) |
| Arby's | [Primary](https://www.arbys.com/locations/us/nc/waxhaw/1001-aspinal-street/store-8821/) | 6.32 | [123 servings](../../data/restaurant-foods/arbys.json) |
| Auntie Anne's | [Primary](https://www.carolinaplace.com/en/directory/) | 6.58 | [128 servings](../../data/restaurant-foods/auntie-annes.json) |
| B.Good | [Historical](https://www.openstreetmap.org/node/6426629947) | 4.61 | **Missing catalog; unresolved** |
| Bad Daddy's Burger Bar | [Map candidate](https://www.openstreetmap.org/node/3313338165) | 4.55 | [169 servings](../../data/restaurant-foods/bad-daddys-burger-bar.json) |
| Baskin-Robbins | [Primary](https://locations.baskinrobbins.com/nc/charlotte/16131-lancaster-hwy-344919-br) | 2.85 | [122 servings](../../data/restaurant-foods/baskin-robbins.json) |
| bb.q Chicken | [Primary](https://bbqchicken.com/locations/) | 2.82 | [49 servings](../../data/restaurant-foods/bb-q-chicken.json) |
| Biryani Nation | [Map candidate](https://www.openstreetmap.org/node/12013406581) | 4.74 | [Source gap audit](candidate-source-audit.json) |
| Blackfinn Ameripub | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [Source gap audit](regional-source-audit.json) |
| Blacow Burger | [Map candidate](https://www.openstreetmap.org/node/5264851362) | 6.88 | **Missing catalog; unresolved** |
| Bojangles | [Primary](https://locations.bojangles.com/sc/indian-land/8327-collins-road-924.html) | 1.16 | [149 servings](../../data/restaurant-foods/bojangles.json) |
| Bonefish Grill | [Map candidate](https://www.openstreetmap.org/way/444341604) | 7.03 | [222 servings](../../data/restaurant-foods/bonefish-grill.json) |
| Bossy Beulah's | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.89 | [Source gap audit](dessert-source-audit.json) |
| Brasserie Copain | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [Source gap audit](dessert-source-audit.json) |
| Brixx Wood Fired Pizza | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [93 servings](../../data/restaurant-foods/brixx-wood-fired-pizza.json) |
| Brooklyn Pizza Parlor | [Map candidate](https://www.openstreetmap.org/node/7703998393) | 9.31 | [Source gap audit](candidate-source-audit.json) |
| Bruegger's Bagels | [Map candidate](https://www.openstreetmap.org/node/3304949961) | 7.01 | [183 servings](../../data/restaurant-foods/brueggers.json) |
| Bruster's Ice Cream | [Map candidate](https://www.openstreetmap.org/way/544204453) | 8.83 | [2,871 servings](../../data/restaurant-foods/brusters-real-ice-cream.json) |
| Buca di Beppo | [Map candidate](https://www.openstreetmap.org/way/186561177) | 6.87 | [91 servings](../../data/restaurant-foods/buca-di-beppo.json) |
| Buffalo Wild Wings | [Primary](https://www.buffalowildwings.com/locations/us/sc/rock-hill/1460-meeting-blvd-,-suite-119/sports-bar-898/) | 6.53 | [679 servings](../../data/restaurant-foods/buffalo-wild-wings.json) |
| Buffalo Wings & Rings | [Map candidate](https://www.openstreetmap.org/node/12887324330) | 7.23 | [998 servings](../../data/restaurant-foods/buffalo-wings-rings.json) |
| Burger 21 | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [98 servings](../../data/restaurant-foods/burger-21.json) |
| Burger King | [Map candidate](https://www.openstreetmap.org/way/324525166) | 6.90 | [210 servings](../../data/restaurant-foods/burger-king.json) |
| Burtons Grill & Bar | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [Source gap audit](regional-source-audit.json) |
| Cabo Fish Taco | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [Source gap audit](parent-source-audit.json) |
| Cafe Moka | [Map candidate](https://www.openstreetmap.org/node/5794491272) | 6.77 | **Missing catalog; unresolved** |
| Captain Steve's | [Map candidate](https://www.openstreetmap.org/way/543832954) | 6.63 | [Source gap audit](candidate-source-audit.json) |
| Carolina Ale House | [Primary](https://www.waverlyclt.com/directory/) | 6.78 | [215 servings](../../data/restaurant-foods/carolina-ale-house.json) |
| CAVA | [Map candidate](https://www.openstreetmap.org/node/3313321879) | 6.85 | [121 servings](../../data/restaurant-foods/cava-grill.json) |
| Charanda | [Map candidate](https://www.openstreetmap.org/node/5264851350) | 6.75 | **Missing catalog; unresolved** |
| Charanda Mexican Grill and Cantina | [Map candidate](https://www.openstreetmap.org/way/250017823) | 6.95 | [Source gap audit](candidate-source-audit.json) |
| Charbar no. 7 | [Map candidate](https://www.openstreetmap.org/way/343111372) | 9.09 | [Source gap audit](regional-source-audit.json) |
| Charleys Philly Steaks | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [158 servings](../../data/restaurant-foods/charleys.json) |
| Chex Grill & Wings | [Primary](https://chexgrill.com/locations/indian-land) | 1.65 | [Source gap audit](regional-source-audit.json) |
| Chick-fil-A | [Primary](https://www.chick-fil-a.com/locations/sc/indian-land) | 1.61 | [372 servings](../../data/restaurant-foods/chick-fil-a.json) |
| Chicken Salad Chick | [Map candidate](https://www.openstreetmap.org/node/3313321882) | 6.86 | [88 servings](../../data/restaurant-foods/chicken-salad-chick.json) |
| Chickie's & Pete's Sports Grill | [Map candidate](https://www.openstreetmap.org/way/668885559) | 9.34 | [Source gap audit](national-blockers.json) |
| Chili's | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 3.73 | [356 servings](../../data/restaurant-foods/chilis.json) |
| Chipotle | [Primary](https://locations.chipotle.com/sc/indian-land/7680-charlotte-hwy) | 3.83 | [112 servings](../../data/restaurant-foods/chipotle.json) |
| Chopt | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [136 servings](../../data/restaurant-foods/chopt.json) |
| Chuck E. Cheese | [Map candidate](https://www.openstreetmap.org/node/3313321876) | 6.83 | [228 servings](../../data/restaurant-foods/chuck-e-cheeses.json) |
| Chuy's | [Primary](https://www.waverlyclt.com/directory/) | 6.78 | [124 servings](../../data/restaurant-foods/chuys.json) |
| Cicis | [Map candidate](https://www.openstreetmap.org/node/3304968064) | 7.12 | [224 servings](../../data/restaurant-foods/cicis-pizza.json) |
| Cinnabon | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [143 servings](../../data/restaurant-foods/cinnabon.json) |
| City Barbeque | [Map candidate](https://www.openstreetmap.org/node/5972512945) | 3.92 | [91 servings](../../data/restaurant-foods/city-barbeque.json) |
| Clean Juice | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [109 servings](../../data/restaurant-foods/clean-juice.json) |
| CO | [Primary](https://www.waverlyclt.com/directory/) | 6.78 | [Source gap audit](parent-source-audit.json) |
| Coffee Republic | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [Source gap audit](dessert-source-audit.json) |
| Cold Stone Creamery | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [738 servings](../../data/restaurant-foods/cold-stone-creamery.json) |
| Condado Tacos | [Map candidate](https://www.openstreetmap.org/node/12887324331) | 7.24 | [93 servings](../../data/restaurant-foods/condado-tacos.json) |
| Cook Out | [Map candidate](https://www.openstreetmap.org/way/322412247) | 7.21 | [141 servings](../../data/restaurant-foods/cook-out.json) |
| Corndogs by Mr. Cow | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [Source gap audit](parent-source-audit.json) |
| Cracker Barrel | [Map candidate](https://www.openstreetmap.org/way/184521300) | 7.18 | [321 servings](../../data/restaurant-foods/cracker-barrel.json) |
| Crispy Banh Mi | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [Source gap audit](parent-source-audit.json) |
| Crumbl Cookies | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [199 servings](../../data/restaurant-foods/crumbl-cookies.json) |
| Culver's | [Primary](https://www.culvers.com/restaurants/indian-land-sc-charlotte-hwy) | 2.93 | [221 servings](../../data/restaurant-foods/culvers.json) |
| Dairy Queen | [Map candidate](https://www.openstreetmap.org/way/250017824) | 6.97 | [435 servings](../../data/restaurant-foods/dairy-queen.json) |
| Dave & Buster's | [Primary](https://www.carolinaplace.com/en/directory/) | 6.52 | [77 servings](../../data/restaurant-foods/dave-busters.json) |
| Del Taco | [Map candidate](https://www.openstreetmap.org/way/185026905) | 7.66 | [101 servings](../../data/restaurant-foods/del-taco.json) |
| DeSano Pizzeria Napoletana | [Map candidate](https://www.openstreetmap.org/node/5794491273) | 6.80 | **Missing catalog; unresolved** |
| Desi District | [Map candidate](https://www.openstreetmap.org/node/13429163100) | 6.10 | [Source gap audit](candidate-source-audit.json) |
| Dickey's BBQ Pit | [Map candidate](https://www.openstreetmap.org/node/3313338154) | 4.62 | [1,080 servings](../../data/restaurant-foods/dickeys-barbecue-pit.json) |
| Dippin' Dots | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [35 servings](../../data/restaurant-foods/dippin-dots.json) |
| Doc Popcorn | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [19 servings](../../data/restaurant-foods/doc-popcorn.json) |
| Domino's | [Primary](https://pizza.dominos.com/south-carolina/indian-land/8447-charlotte-highway) | 2.10 | [729 servings](../../data/restaurant-foods/dominos.json) |
| Don Pedro Mexican | [Map candidate](https://www.openstreetmap.org/way/324524212) | 6.86 | [Source gap audit](candidate-source-audit.json) |
| Duckworth's Grill & Taphouse | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | **Missing catalog; unresolved** |
| Dunkin' | [Primary](https://locations.dunkindonuts.com/en/sc/indian-land/8374-charlotte-hwy/350890) | 2.25 | [975 servings](../../data/restaurant-foods/dunkin.json) |
| Eggs Up Grill | [Primary](https://locations.eggsupgrill.com/sc/rock-hill/23/) | 9.58 | [39 servings](../../data/restaurant-foods/eggs-up-grill.json) |
| Eggspectation | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [113 servings](../../data/restaurant-foods/eggspectation.json) |
| Einstein Bros. Bagels | [Primary](https://locations.einsteinbros.com/us/nc/charlotte/13736-conlan-cir) | 4.82 | [229 servings](../../data/restaurant-foods/einstein-bros-bagels.json) |
| Empire Pizza | [Map candidate](https://www.openstreetmap.org/node/7048148282) | 1.71 | [Source gap audit](candidate-source-audit.json) |
| Everbowl | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [26 servings](../../data/restaurant-foods/everbowl.json) |
| Famous Dave's | [Map candidate](https://www.openstreetmap.org/way/860943132) | 8.75 | [257 servings](../../data/restaurant-foods/famous-daves.json) |
| Famous Toastery | [Map candidate](https://www.openstreetmap.org/way/546854704) | 0.75 | [Source gap audit](national-blockers.json) |
| Firebirds Wood Fired Grill | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [217 servings](../../data/restaurant-foods/firebirds-wood-fired-grill.json) |
| Firehouse Subs | [Map candidate](https://www.openstreetmap.org/node/3313330809) | 2.92 | [906 servings](../../data/restaurant-foods/firehouse-subs.json) |
| First Watch | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.81 | [149 servings](../../data/restaurant-foods/first-watch.json) |
| Five Guys | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [66 servings](../../data/restaurant-foods/five-guys.json) |
| Flower Child | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [80 servings](../../data/restaurant-foods/flower-child.json) |
| Flying Biscuit Cafe | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [Source gap audit](regional-source-audit.json) |
| Fox's Pizza Den | [Map candidate](https://www.openstreetmap.org/way/823898600) | 7.97 | [52 servings](../../data/restaurant-foods/foxs-pizza-den.json) |
| Foxcroft Wine Co. | [Primary](https://www.waverlyclt.com/directory/) | 6.78 | [Source gap audit](parent-source-audit.json) |
| Freddy's | [Primary](https://www.redstoneshopping.com/) | 0.71 | [306 servings](../../data/restaurant-foods/freddys.json) |
| Fresh Monkee | [Map candidate](https://www.openstreetmap.org/node/13087271725) | 2.99 | [84 servings](../../data/restaurant-foods/fresh-monkee.json) |
| Fuel Pizza | [Map candidate](https://www.openstreetmap.org/way/250017826) | 7.44 | [Source gap audit](national-blockers.json) |
| Fuzzy's Taco Shop | [Map candidate](https://www.openstreetmap.org/node/7514756881) | 6.63 | [218 servings](../../data/restaurant-foods/fuzzys-taco-shop.json) |
| Golden Corral | [Map candidate](https://www.openstreetmap.org/way/931054321) | 7.80 | [1,039 servings](../../data/restaurant-foods/golden-corral.json) |
| Greco Fresh Grille | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [Source gap audit](regional-source-audit.json) |
| Habit Burger & Grill | [Primary](https://www.habitburger.com/locations/indian-land-sc-dt/) | 3.51 | [88 servings](../../data/restaurant-foods/the-habit-burger-grill.json) |
| Handel's Homemade Ice Cream | [Primary](https://www.redstoneshopping.com/) | 0.71 | [133 servings](../../data/restaurant-foods/handels-homemade-ice-cream.json) |
| Hardee's | [Primary](https://locations.hardees.com/sc/rock-hill/2165-mana-court) | 7.11 | [67 servings](../../data/restaurant-foods/hardees.json) |
| Harper's | [Map candidate](https://www.openstreetmap.org/node/5206617706) | 6.59 | **Missing catalog; unresolved** |
| Harriet's Hamburgers | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.87 | [Source gap audit](parent-source-audit.json) |
| Hawkers | [Map candidate](https://www.openstreetmap.org/node/12138836851) | 4.98 | [Source gap audit](national-blockers.json) |
| Hawthorne's NY Pizza & Bar | [Map candidate](https://www.openstreetmap.org/node/6286798032) | 5.26 | [Source gap audit](regional-source-audit.json) |
| Hazelnuts Creperie | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [Source gap audit](parent-source-audit.json) |
| Hickory Tavern | [Map candidate](https://www.openstreetmap.org/way/546867191) | 2.30 | [Source gap audit](national-blockers.json) |
| Hobo's | [Map candidate](https://www.openstreetmap.org/node/5266068955) | 5.07 | [Source gap audit](candidate-source-audit.json) |
| Honey Baked Ham | [Map candidate](https://www.openstreetmap.org/node/3313321877) | 6.83 | [395 servings](../../data/restaurant-foods/honeybaked-ham.json) |
| Honeysuckle Gelato | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.91 | [Source gap audit](dessert-source-audit.json) |
| Hooters | [Map candidate](https://www.openstreetmap.org/way/28434717) | 7.60 | [779 servings](../../data/restaurant-foods/hooters.json) |
| Hungry Howie's | [Map candidate](https://www.openstreetmap.org/node/3304917488) | 6.95 | [279 servings](../../data/restaurant-foods/hungry-howies.json) |
| Hwy 55 Burgers Shakes & Fries | [Map candidate](https://www.openstreetmap.org/way/546867192) | 2.33 | [56 servings](../../data/restaurant-foods/hwy55.json) |
| Häagen-Dazs | [Primary](https://www.waverlyclt.com/directory/) | 6.78 | [Source gap audit](dessert-source-audit.json) |
| IHOP | [Primary](https://restaurants.ihop.com/en-us/nc/charlotte/breakfast-16015-a-lancaster-hwy-3423) | 3.00 | [383 servings](../../data/restaurant-foods/ihop.json) |
| Ilios Crafted Greek | [Primary](https://shopstonecrest.com/directory/) | 5.50 | [Source gap audit](regional-source-audit.json) |
| Ilios Noche | [Map candidate](https://www.openstreetmap.org/node/14016028375) | 6.71 | [Source gap audit](regional-source-audit.json) |
| Inizio Pizza | [Map candidate](https://www.openstreetmap.org/node/11867470931) | 7.92 | [Source gap audit](regional-source-audit.json) |
| Jack in the Box | [Primary](https://locations.jackinthebox.com/us/nc/charlotte/7725-pineville-matthews-rd) | 6.90 | [180 servings](../../data/restaurant-foods/jack-in-the-box.json) |
| Jamba | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [204 servings](../../data/restaurant-foods/jamba.json) |
| Jason's Deli | [Map candidate](https://www.openstreetmap.org/node/2588395414) | 7.07 | [182 servings](../../data/restaurant-foods/jasons-deli.json) |
| Jeff's Bagel Run | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [231 servings](../../data/restaurant-foods/jeffs-bagel-run.json) |
| Jeni's Splendid Ice Creams | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [38 servings](../../data/restaurant-foods/jenis-splendid-ice-creams.json) |
| Jersey Mike's Subs | [Primary](https://shopstonecrest.com/directory/) | 2.13 | [722 servings](../../data/restaurant-foods/jersey-mikes-subs.json) |
| Jet's Pizza | [Map candidate](https://www.openstreetmap.org/node/2923620802) | 7.09 | [246 servings](../../data/restaurant-foods/jets-pizza.json) |
| Jim 'N Nick's Bar-B-Q | [Map candidate](https://www.openstreetmap.org/way/546854706) | 0.79 | [104 servings](../../data/restaurant-foods/jim-n-nicks.json) |
| Jimmy John's | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 3.01 | [312 servings](../../data/restaurant-foods/jimmy-johns.json) |
| KFC | [Primary](https://locations.kfc.com/sc/indian-land/9615-charlotte-highway) | 0.60 | [217 servings](../../data/restaurant-foods/kfc.json) |
| KPOT Korean BBQ & Hot Pot | [Map candidate](https://www.openstreetmap.org/node/3304949967) | 7.00 | **Missing catalog; unresolved** |
| Krispy Kreme | [Map candidate](https://www.openstreetmap.org/way/322415087) | 7.05 | [143 servings](../../data/restaurant-foods/krispy-kreme.json) |
| Kura Sushi | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [138 servings](../../data/restaurant-foods/kura-sushi.json) |
| Le Peep | [Primary](https://lepeep.com/stores/south-caroline-ft-mill/) | 3.83 | [142 servings](../../data/restaurant-foods/le-peep.json) |
| Lean Kitchen | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [10 servings](../../data/restaurant-foods/lean-kitchen.json) |
| Lee's Hoagie House | [Map candidate](https://www.openstreetmap.org/node/13087271787) | 3.77 | [Source gap audit](national-blockers.json) |
| Link & Pin | [Map candidate](https://www.openstreetmap.org/node/12521589433) | 8.70 | **Missing catalog; unresolved** |
| Little Caesars | [Map candidate](https://www.openstreetmap.org/way/121020808) | 8.37 | [80 servings](../../data/restaurant-foods/little-caesars.json) |
| Little Mama's Italian Kitchen | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [Source gap audit](parent-source-audit.json) |
| LongHorn Steakhouse | [Map candidate](https://www.openstreetmap.org/way/184521301) | 6.98 | [186 servings](../../data/restaurant-foods/longhorn-steakhouse.json) |
| Los Aztecas | [Primary](https://losaztecasindianla.wixsite.com/mysite/contact-us) | 2.07 | [Source gap audit](parent-source-audit.json) |
| Manhattan Bagel | [Map candidate](https://www.openstreetmap.org/node/2698801250) | 8.79 | [264 servings](../../data/restaurant-foods/manhattan-bagel.json) |
| Marble Slab Creamery | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [665 servings](../../data/restaurant-foods/marble-slab-creamery.json) |
| Marco's Pizza | [Map candidate](https://www.openstreetmap.org/node/5284239260) | 1.75 | [502 servings](../../data/restaurant-foods/marcos-pizza.json) |
| Mason's Famous Lobster Rolls | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [Source gap audit](national-blockers.json) |
| Mayflower | [Map candidate](https://www.openstreetmap.org/way/121219421) | 8.54 | **Missing catalog; unresolved** |
| McAlister's Deli | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 3.67 | [290 servings](../../data/restaurant-foods/mcalisters-deli.json) |
| McDonald's | [Primary](https://www.mcdonalds.com/us/en-us/location/sc/fort-mill/10108-charlotte-highway/34398.html) | 1.78 | [120 servings](../../data/restaurant-foods/mcdonalds.json) |
| Mellow Mushroom | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [287 servings](../../data/restaurant-foods/mellow-mushroom.json) |
| Menchie's | [Historical](https://www.openstreetmap.org/node/6074010963) | 0.89 | **Missing catalog; unresolved** |
| Metro Diner | [Primary](https://metrodiner.com/locations/south-carolina/indian-land/) | 1.67 | [Source gap audit](regional-source-audit.json) |
| Midwood Smokehouse | [Map candidate](https://www.openstreetmap.org/way/926764815) | 5.77 | [Source gap audit](regional-source-audit.json) |
| Milk Cha-Cha | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [Source gap audit](parent-source-audit.json) |
| MOD Pizza | [Primary](https://locations.modpizza.com/usa/nc/charlotte/15127-ballancroft-pkwy) | 3.67 | [198 servings](../../data/restaurant-foods/mod-pizza.json) |
| Moe's Southwest Grill | [Primary](https://www.redstoneshopping.com/) | 0.71 | [84 servings](../../data/restaurant-foods/moes.json) |
| Mr. Tokyo Japanese Restaurant | [Map candidate](https://www.openstreetmap.org/node/4684453912) | 6.97 | **Missing catalog; unresolved** |
| Naf Naf Grill | [Primary](https://www.nafnafgrill.com/locations/#jump-promenade) | 7.23 | [33 servings](../../data/restaurant-foods/naf-naf-grill.json) |
| Nana Morrison's Soul Food | [Primary](https://www.redstoneshopping.com/) | 0.71 | [Source gap audit](parent-source-audit.json) |
| Napa Bistro & Wine Bar | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [Source gap audit](parent-source-audit.json) |
| Nestlé Toll House Café | [Historical](https://www.openstreetmap.org/node/5198084072) | 6.58 | **Missing catalog; unresolved** |
| Noodles & Company | [Map candidate](https://www.openstreetmap.org/node/5364185676) | 8.84 | [58 servings](../../data/restaurant-foods/noodles-company.json) |
| North Italia | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.92 | [316 servings](../../data/restaurant-foods/north-italia.json) |
| Nothing But Noodles | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [67 servings](../../data/restaurant-foods/nothing-but-noodles.json) |
| Olde Mecklenburg Brewery | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [Source gap audit](parent-source-audit.json) |
| Olive Garden | [Map candidate](https://www.openstreetmap.org/way/628047092) | 6.92 | [276 servings](../../data/restaurant-foods/olive-garden.json) |
| Open Rice | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [Source gap audit](parent-source-audit.json) |
| Outback Steakhouse | [Primary](https://locations.outback.com/north-carolina/charlotte) | 6.94 | [494 servings](../../data/restaurant-foods/outback-steakhouse.json) |
| Palm Berries | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [20 servings](../../data/restaurant-foods/palm-berries.json) |
| Panda Express | [Map candidate](https://www.openstreetmap.org/way/669984378) | 9.16 | [184 servings](../../data/restaurant-foods/panda-express.json) |
| Panera Bread | [Primary](https://www.ballantynevillage.com/directory/) | 3.44 | [594 servings](../../data/restaurant-foods/panera-bread.json) |
| Papa John's | [Primary](https://locations.papajohns.com/united-states/sc/29707/indian-land/6257-carolina-commons-dr) | 2.92 | [724 servings](../../data/restaurant-foods/papa-johns.json) |
| Papa Murphy's | [Map candidate](https://www.openstreetmap.org/node/5260801985) | 9.21 | [176 servings](../../data/restaurant-foods/papa-murphys.json) |
| Paris Baguette | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [122 servings](../../data/restaurant-foods/paris-baguette.json) |
| Pei Wei | [Map candidate](https://www.openstreetmap.org/node/5127122852) | 4.71 | [60 servings](../../data/restaurant-foods/pei-wei-asian-diner.json) |
| Penn Station | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [138 servings](../../data/restaurant-foods/penn-station-east-coast-subs.json) |
| Pio Pio | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [Source gap audit](parent-source-audit.json) |
| Pizza Hut | [Primary](https://locations.pizzahut.com/nc/charlotte/15105-john-j-delaney-dr) | 4.60 | [824 servings](../../data/restaurant-foods/pizza-hut.json) |
| Pollo Campero | [Map candidate](https://www.openstreetmap.org/way/129886222) | 7.46 | [88 servings](../../data/restaurant-foods/pollo-campero.json) |
| Popeyes | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [67 servings](../../data/restaurant-foods/popeyes.json) |
| PopUp Bagels | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [Source gap audit](dessert-source-audit.json) |
| Portofino's | [Primary](https://www.redstoneshopping.com/) | 0.71 | [Source gap audit](parent-source-audit.json) |
| Postino | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [139 servings](../../data/restaurant-foods/postino.json) |
| Potbelly | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [372 servings](../../data/restaurant-foods/potbelly.json) |
| Qdoba | [Primary](https://locations.qdoba.com/us/nc/matthews/3321-siskey-pkwy.html) | 2.52 | [135 servings](../../data/restaurant-foods/qdoba.json) |
| Que Onda | [Map candidate](https://www.openstreetmap.org/node/3329467152) | 9.70 | [Source gap audit](candidate-source-audit.json) |
| Rai Lay Asian Fusion | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [Source gap audit](parent-source-audit.json) |
| Raising Cane's | [Primary](https://locations.raisingcanes.com/sc/rock-hill/520-john-ross-pkwy) | 7.54 | [108 servings](../../data/restaurant-foods/raising-canes.json) |
| Red Bowl Asian Bistro | [Map candidate](https://www.openstreetmap.org/node/4606085312) | 3.63 | [Source gap audit](candidate-source-audit.json) |
| Red Lobster | [Map candidate](https://www.openstreetmap.org/way/324525781) | 6.93 | [276 servings](../../data/restaurant-foods/red-lobster.json) |
| Red Robin | [Primary](https://www.redrobin.com/locations/nc/charlotte/toringdon-423) | 5.67 | [445 servings](../../data/restaurant-foods/red-robin.json) |
| Red Rocks Cafe | [Historical](https://www.openstreetmap.org/node/6074010960) | 0.84 | **Missing catalog; unresolved** |
| Rico's Acai | [Map candidate](https://www.openstreetmap.org/node/6286798031) | 5.22 | [Source gap audit](candidate-source-audit.json) |
| Rita's Italian Ice | [Map candidate](https://www.openstreetmap.org/node/13087271719) | 2.53 | [Source gap audit](national-blockers.json) |
| Rooster's | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.88 | [Source gap audit](parent-source-audit.json) |
| Ruby Sunshine | [Map candidate](https://www.openstreetmap.org/way/926764822) | 5.83 | [Source gap audit](national-blockers.json) |
| Ruby Thai | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [Source gap audit](parent-source-audit.json) |
| Ruby Tuesday | [Map candidate](https://www.openstreetmap.org/way/184521305) | 7.05 | [191 servings](../../data/restaurant-foods/ruby-tuesday.json) |
| Sabor Latin Street Grill | [Map candidate](https://www.openstreetmap.org/node/12013406574) | 4.72 | [Source gap audit](regional-source-audit.json) |
| Salata | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [263 servings](../../data/restaurant-foods/salata.json) |
| Salsarita's | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 2.26 | [84 servings](../../data/restaurant-foods/salsaritas.json) |
| Sarku Japan | [Primary](https://www.carolinaplace.com/en/directory/) | 6.61 | [110 servings](../../data/restaurant-foods/sarku-japan.json) |
| Sbarro | [Primary](https://www.carolinaplace.com/en/directory/) | 6.63 | [104 servings](../../data/restaurant-foods/sbarro.json) |
| Shake Shack | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [214 servings](../../data/restaurant-foods/shake-shack.json) |
| Showmars | [Map candidate](https://www.openstreetmap.org/way/497234362) | 1.07 | [165 servings](../../data/restaurant-foods/showmars.json) |
| Slim Chickens | [Primary](https://www.visityorkcounty.com/listing/slim-chickens/7628/) | 6.69 | [146 servings](../../data/restaurant-foods/slim-chickens.json) |
| Smashburger | [Primary](https://smashburger.com/locations/us/sc/fort-mill/1329-broadcloth-st) | 6.41 | [45 servings](../../data/restaurant-foods/smashburger.json) |
| Smoothie King | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 4.33 | [367 servings](../../data/restaurant-foods/smoothie-king.json) |
| Sonic | [Map candidate](https://www.openstreetmap.org/relation/9968285) | 8.01 | [579 servings](../../data/restaurant-foods/sonic.json) |
| Sonny's BBQ | [Map candidate](https://www.openstreetmap.org/way/216523196) | 7.15 | [164 servings](../../data/restaurant-foods/sonnys-bbq.json) |
| South Block | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [29 servings](../../data/restaurant-foods/south-block.json) |
| Starbucks | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 3.73 | [3,625 servings](../../data/restaurant-foods/starbucks.json) |
| Steak 'n Shake | [Primary](https://www.steaknshake.com/locations/sc-rock-hill-cherry-road/) | 7.18 | [110 servings](../../data/restaurant-foods/steak-n-shake.json) |
| Subway | [Primary](https://restaurants.subway.com/united-states/sc/fort-mills/9789-charlotte-hwy) | 1.17 | [226 servings](../../data/restaurant-foods/subway.json) |
| Summit Coffee | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.80 | [Source gap audit](parent-source-audit.json) |
| Super Chix | [Primary](https://www.redstoneshopping.com/) | 0.71 | [98 servings](../../data/restaurant-foods/super-chix.json) |
| sweetFrog | [Map candidate](https://www.openstreetmap.org/way/250255633) | 7.51 | [274 servings](../../data/restaurant-foods/sweetfrog.json) |
| Sweetwaters Coffee & Tea | [Primary](https://www.redstoneshopping.com/) | 0.71 | [619 servings](../../data/restaurant-foods/sweetwaters-coffee-tea.json) |
| Swig | [Primary](https://swig.com/stores/indian-land) | 2.09 | [247 servings](../../data/restaurant-foods/swig.json) |
| Taco Bell | [Primary](https://locations.tacobell.com/sc/fort-mill/9915-charlotte-hwy-.html) | 1.34 | [513 servings](../../data/restaurant-foods/taco-bell.json) |
| Tacos 4 Life | [Map candidate](https://www.openstreetmap.org/node/9945982768) | 8.55 | [77 servings](../../data/restaurant-foods/tacos-4-life.json) |
| Tap & Vine | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [Source gap audit](parent-source-audit.json) |
| Taziki's Mediterranean Cafe | [Primary](https://www.waverlyclt.com/directory/) | 6.78 | [251 servings](../../data/restaurant-foods/tazikis-mediterranean-cafe.json) |
| TCBY | [Primary](https://www.regencycenters.com/property/detail/60925/Blakeney-Town-Center) | 2.13 | [81 servings](../../data/restaurant-foods/tcby.json) |
| Ted's Montana Grill | [Primary](https://www.waverlyclt.com/directory/) | 6.74 | [220 servings](../../data/restaurant-foods/teds-montana-grill.json) |
| Ten Seconds | [Map candidate](https://www.openstreetmap.org/node/11586004568) | 5.67 | **Missing catalog; unresolved** |
| Texas Roadhouse | [Map candidate](https://www.openstreetmap.org/node/12613436901) | 6.70 | [253 servings](../../data/restaurant-foods/texas-roadhouse.json) |
| Thai House | [Map candidate](https://www.openstreetmap.org/node/3304949964) | 7.03 | [Source gap audit](candidate-source-audit.json) |
| The Crust Pizza | [Map candidate](https://www.openstreetmap.org/way/515111778) | 7.24 | **Missing catalog; unresolved** |
| The Greek Grill | [Primary](https://www.redstoneshopping.com/) | 0.71 | [Source gap audit](parent-source-audit.json) |
| The Improper Pig | [Primary](https://www.inventrustproperties.com/property/rea-farms/) | 6.56 | [Source gap audit](parent-source-audit.json) |
| The Office Craft Bar and Kitchen | [Primary](https://shopstonecrest.com/directory/) | 5.63 | [Source gap audit](parent-source-audit.json) |
| The Salty Donut | [Primary](https://www.goballantyne.com/things-to-do/restaurant) | 4.94 | [Source gap audit](dessert-source-audit.json) |
| Tifa Chocolates & Gelato | [Primary](https://www.ballantynevillage.com/directory/) | 4.63 | [Source gap audit](dessert-source-audit.json) |
| Tony's Pizza | [Map candidate](https://www.openstreetmap.org/node/5129857998) | 4.76 | **Missing catalog; unresolved** |
| Tropical Smoothie Cafe | [Primary](https://www.redstoneshopping.com/) | 0.71 | [124 servings](../../data/restaurant-foods/tropical-smoothie-cafe.json) |
| Twin Peaks | [Map candidate](https://www.openstreetmap.org/way/1536800201) | 8.71 | [314 servings](../../data/restaurant-foods/twin-peaks.json) |
| Vicious Biscuit | [Map candidate](https://www.openstreetmap.org/node/5363922476) | 8.69 | [Source gap audit](national-blockers.json) |
| Viva Chicken | [Primary](https://vivachicken.com/locations/redstone/) | 0.71 | [57 servings](../../data/restaurant-foods/viva-chicken.json) |
| Waffle House | [Primary](https://locations.wafflehouse.com/charlotte-nc-1157/) | 6.94 | [163 servings](../../data/restaurant-foods/waffle-house.json) |
| Waterbean Coffee | [Map candidate](https://www.openstreetmap.org/node/11954974288) | 7.03 | **Missing catalog; unresolved** |
| Wendy's | [Primary](https://locations.wendys.com/united-states/nc/charlotte/16055-johnston-road) | 2.93 | [222 servings](../../data/restaurant-foods/wendys.json) |
| Whataburger | [Map candidate](https://www.openstreetmap.org/way/1429869079) | 1.79 | [238 servings](../../data/restaurant-foods/whataburger.json) |
| Which Wich? | [Map candidate](https://www.openstreetmap.org/node/6074010954) | 0.77 | [374 servings](../../data/restaurant-foods/which-wich.json) |
| Wingstop | [Primary](https://locations.wingstop.com/nc/charlotte/wingstop-1499-charlotte-nc-28226) | 6.94 | [94 servings](../../data/restaurant-foods/wingstop.json) |
| Wolfman Pizza | [Map candidate](https://www.openstreetmap.org/node/3304497473) | 8.96 | **Missing catalog; unresolved** |
| Zaxby's | [Map candidate](https://www.openstreetmap.org/node/4606085311) | 3.83 | [196 servings](../../data/restaurant-foods/zaxbys.json) |

## Refresh procedure

Revisit the primary directory/locator URLs in `coverage.json`, rerun the saved Overpass query around the recorded Census point, and compare new openings/closures. Preserve map-only and historical states until stronger evidence resolves them. Match aliases using `catalogFile`; do not infer radius eligibility solely from a similarly named catalog. Re-import nutrition from source URLs with all serving and column checks, then refresh catalog counts. Review candidates near ten miles using actual storefront coordinates before promoting their eligibility.
