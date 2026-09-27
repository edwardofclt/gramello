import { test } from '@playwright/test';
import { deepSearchScroll, searchWorkflow, trustworthyVariants } from '../../tests/food-search-ui-scenarios';
test('local search, automatic online fallback, continuation and refinement', async ({ page }) => { await searchWorkflow(page, true); });
test('trusted groups keep exact serving variants selectable', async ({ page }) => { await trustworthyVariants(page, true); });

test('Back restores the deep result position after the amount panel shrinks the dialog', async ({ page }) => { await deepSearchScroll(page, true); });
