// Starter recipe library — 20 healthy, whole-food recipes for each of the six
// meal categories (120 total), each filed under a food-type sub-category so the
// Nutrition tab can browse Breakfast → "Eggs & Dairy", Lunch → "Fish & Seafood",
// and so on.
//
// Recipe shape matches the `recipes` collection exactly, plus a new `sub` field:
//   { name, cat, sub, cal, p, c, f, prep }   // p/c/f in grams, cal in kcal
//
// Macros are sensible per-serving templates for an athlete — a coach can tune
// them. Seeding is additive and de-dupes by name+category, so it never disturbs
// recipes you've already added.

export const RECIPE_SEED = [
  // ══════════════════ BREAKFAST ══════════════════
  // Eggs & Dairy
  { cat: "Breakfast", sub: "Eggs & Dairy", name: "Veggie Egg-White Scramble", cal: 320, p: 34, c: 18, f: 12, prep: "12 min" },
  { cat: "Breakfast", sub: "Eggs & Dairy", name: "Three-Egg Spinach & Feta Omelette", cal: 380, p: 28, c: 8, f: 26, prep: "12 min" },
  { cat: "Breakfast", sub: "Eggs & Dairy", name: "Cottage Cheese & Berry Bowl", cal: 290, p: 28, c: 30, f: 6, prep: "5 min" },
  { cat: "Breakfast", sub: "Eggs & Dairy", name: "Greek Yogurt Protein Parfait", cal: 340, p: 26, c: 42, f: 7, prep: "5 min" },
  { cat: "Breakfast", sub: "Eggs & Dairy", name: "Shakshuka with Peppers", cal: 360, p: 22, c: 24, f: 20, prep: "20 min" },
  // Oats & Grains
  { cat: "Breakfast", sub: "Oats & Grains", name: "Overnight Oats with Chia", cal: 400, p: 20, c: 58, f: 11, prep: "overnight" },
  { cat: "Breakfast", sub: "Oats & Grains", name: "Steel-Cut Oats & Banana", cal: 380, p: 14, c: 68, f: 8, prep: "15 min" },
  { cat: "Breakfast", sub: "Oats & Grains", name: "Protein Oatmeal with Peanut Butter", cal: 450, p: 30, c: 55, f: 14, prep: "10 min" },
  { cat: "Breakfast", sub: "Oats & Grains", name: "Quinoa Breakfast Bowl", cal: 410, p: 18, c: 60, f: 12, prep: "15 min" },
  { cat: "Breakfast", sub: "Oats & Grains", name: "Buckwheat Blueberry Porridge", cal: 370, p: 14, c: 64, f: 9, prep: "15 min" },
  // Fruit & Smoothies
  { cat: "Breakfast", sub: "Fruit & Smoothies", name: "Green Protein Smoothie", cal: 330, p: 30, c: 40, f: 6, prep: "5 min" },
  { cat: "Breakfast", sub: "Fruit & Smoothies", name: "Berry Banana Protein Shake", cal: 350, p: 32, c: 46, f: 5, prep: "5 min" },
  { cat: "Breakfast", sub: "Fruit & Smoothies", name: "Mango Greek-Yogurt Smoothie", cal: 320, p: 24, c: 52, f: 4, prep: "5 min" },
  { cat: "Breakfast", sub: "Fruit & Smoothies", name: "Apple-Cinnamon Overnight Bowl", cal: 360, p: 16, c: 58, f: 9, prep: "overnight" },
  { cat: "Breakfast", sub: "Fruit & Smoothies", name: "Mixed Fruit & Almond Bowl", cal: 300, p: 10, c: 48, f: 11, prep: "5 min" },
  // Whole-Grain Bakes
  { cat: "Breakfast", sub: "Whole-Grain Bakes", name: "Avocado Toast on Whole-Grain", cal: 340, p: 12, c: 38, f: 17, prep: "8 min" },
  { cat: "Breakfast", sub: "Whole-Grain Bakes", name: "Whole-Wheat Banana Pancakes", cal: 430, p: 22, c: 62, f: 11, prep: "18 min" },
  { cat: "Breakfast", sub: "Whole-Grain Bakes", name: "Sweet Potato & Egg Hash", cal: 390, p: 20, c: 44, f: 15, prep: "20 min" },
  { cat: "Breakfast", sub: "Whole-Grain Bakes", name: "Oat & Egg Breakfast Muffins", cal: 260, p: 18, c: 26, f: 10, prep: "25 min" },
  { cat: "Breakfast", sub: "Whole-Grain Bakes", name: "Ezekiel Toast with Nut Butter", cal: 370, p: 15, c: 44, f: 15, prep: "5 min" },

  // ══════════════════ LUNCH ══════════════════
  // Poultry
  { cat: "Lunch", sub: "Poultry", name: "Grilled Chicken & Quinoa Bowl", cal: 520, p: 45, c: 52, f: 14, prep: "20 min" },
  { cat: "Lunch", sub: "Poultry", name: "Chicken & Avocado Wrap", cal: 480, p: 38, c: 44, f: 18, prep: "12 min" },
  { cat: "Lunch", sub: "Poultry", name: "Turkey & Brown Rice Stir-Fry", cal: 500, p: 42, c: 55, f: 13, prep: "20 min" },
  { cat: "Lunch", sub: "Poultry", name: "Buffalo Chicken Power Salad", cal: 430, p: 44, c: 20, f: 20, prep: "15 min" },
  { cat: "Lunch", sub: "Poultry", name: "Chicken Burrito Bowl", cal: 560, p: 42, c: 60, f: 16, prep: "20 min" },
  // Fish & Seafood
  { cat: "Lunch", sub: "Fish & Seafood", name: "Tuna & White-Bean Salad", cal: 410, p: 40, c: 34, f: 12, prep: "10 min" },
  { cat: "Lunch", sub: "Fish & Seafood", name: "Salmon Poke Bowl", cal: 540, p: 38, c: 58, f: 18, prep: "18 min" },
  { cat: "Lunch", sub: "Fish & Seafood", name: "Shrimp & Quinoa Salad", cal: 440, p: 36, c: 48, f: 12, prep: "18 min" },
  { cat: "Lunch", sub: "Fish & Seafood", name: "Grilled Cod Taco Bowl", cal: 470, p: 38, c: 46, f: 15, prep: "20 min" },
  // Beans & Legumes
  { cat: "Lunch", sub: "Beans & Legumes", name: "Lentil & Veggie Soup", cal: 380, p: 22, c: 56, f: 7, prep: "25 min" },
  { cat: "Lunch", sub: "Beans & Legumes", name: "Chickpea Mediterranean Bowl", cal: 460, p: 20, c: 62, f: 16, prep: "15 min" },
  { cat: "Lunch", sub: "Beans & Legumes", name: "Black-Bean & Sweet-Potato Bowl", cal: 440, p: 18, c: 70, f: 10, prep: "22 min" },
  { cat: "Lunch", sub: "Beans & Legumes", name: "Edamame & Brown-Rice Bowl", cal: 420, p: 24, c: 58, f: 11, prep: "15 min" },
  // Grain Bowls & Salads
  { cat: "Lunch", sub: "Grain Bowls", name: "Mediterranean Farro Bowl", cal: 480, p: 20, c: 66, f: 15, prep: "20 min" },
  { cat: "Lunch", sub: "Grain Bowls", name: "Brown Rice & Roasted Veg Bowl", cal: 450, p: 16, c: 68, f: 13, prep: "25 min" },
  { cat: "Lunch", sub: "Salads", name: "Kale, Quinoa & Almond Salad", cal: 400, p: 15, c: 44, f: 19, prep: "15 min" },
  { cat: "Lunch", sub: "Salads", name: "Cobb Salad with Grilled Chicken", cal: 490, p: 40, c: 18, f: 28, prep: "15 min" },
  { cat: "Lunch", sub: "Salads", name: "Caprese & White-Bean Salad", cal: 420, p: 22, c: 34, f: 22, prep: "10 min" },
  { cat: "Lunch", sub: "Grain Bowls", name: "Teriyaki Tofu Rice Bowl", cal: 470, p: 24, c: 64, f: 13, prep: "20 min" },
  { cat: "Lunch", sub: "Salads", name: "Spinach, Egg & Bacon Salad", cal: 410, p: 30, c: 16, f: 26, prep: "12 min" },

  // ══════════════════ DINNER ══════════════════
  // Poultry
  { cat: "Dinner", sub: "Poultry", name: "Baked Chicken, Potatoes & Greens", cal: 580, p: 48, c: 52, f: 18, prep: "35 min" },
  { cat: "Dinner", sub: "Poultry", name: "Chicken Fajita Skillet", cal: 520, p: 44, c: 46, f: 16, prep: "25 min" },
  { cat: "Dinner", sub: "Poultry", name: "Turkey Meatballs & Zucchini", cal: 480, p: 42, c: 30, f: 22, prep: "30 min" },
  { cat: "Dinner", sub: "Poultry", name: "Sheet-Pan Chicken & Veg", cal: 540, p: 46, c: 44, f: 19, prep: "35 min" },
  // Beef & Pork
  { cat: "Dinner", sub: "Beef & Pork", name: "Lean Steak, Broccoli & Quinoa", cal: 560, p: 46, c: 40, f: 24, prep: "25 min" },
  { cat: "Dinner", sub: "Beef & Pork", name: "Beef & Veg Stir-Fry", cal: 540, p: 42, c: 48, f: 20, prep: "22 min" },
  { cat: "Dinner", sub: "Beef & Pork", name: "Pork Tenderloin & Sweet Potato", cal: 520, p: 44, c: 46, f: 17, prep: "30 min" },
  { cat: "Dinner", sub: "Beef & Pork", name: "Bison Chili with Beans", cal: 490, p: 40, c: 44, f: 16, prep: "35 min" },
  // Fish & Seafood
  { cat: "Dinner", sub: "Fish & Seafood", name: "Baked Salmon & Asparagus", cal: 520, p: 42, c: 24, f: 28, prep: "25 min" },
  { cat: "Dinner", sub: "Fish & Seafood", name: "Garlic Shrimp & Brown Rice", cal: 480, p: 38, c: 56, f: 12, prep: "20 min" },
  { cat: "Dinner", sub: "Fish & Seafood", name: "Blackened Tilapia & Quinoa", cal: 460, p: 42, c: 40, f: 14, prep: "22 min" },
  { cat: "Dinner", sub: "Fish & Seafood", name: "Seared Tuna Rice Bowl", cal: 500, p: 44, c: 52, f: 13, prep: "18 min" },
  // Plant-Based
  { cat: "Dinner", sub: "Plant-Based", name: "Tofu & Veggie Buddha Bowl", cal: 470, p: 24, c: 58, f: 16, prep: "25 min" },
  { cat: "Dinner", sub: "Plant-Based", name: "Chickpea Coconut Curry", cal: 500, p: 20, c: 66, f: 18, prep: "30 min" },
  { cat: "Dinner", sub: "Plant-Based", name: "Lentil Bolognese & Whole-Wheat Pasta", cal: 520, p: 26, c: 78, f: 11, prep: "30 min" },
  { cat: "Dinner", sub: "Plant-Based", name: "Stuffed Bell Peppers & Quinoa", cal: 440, p: 20, c: 60, f: 14, prep: "35 min" },
  // Pasta & Grains
  { cat: "Dinner", sub: "Pasta & Grains", name: "Whole-Wheat Pasta & Chicken", cal: 620, p: 44, c: 78, f: 14, prep: "25 min" },
  { cat: "Dinner", sub: "Pasta & Grains", name: "Turkey & Brown-Rice Casserole", cal: 560, p: 42, c: 62, f: 15, prep: "35 min" },
  { cat: "Dinner", sub: "Pasta & Grains", name: "Shrimp & Whole-Wheat Linguine", cal: 580, p: 38, c: 74, f: 15, prep: "25 min" },
  { cat: "Dinner", sub: "Pasta & Grains", name: "Barley Risotto with Mushrooms", cal: 480, p: 18, c: 72, f: 12, prep: "35 min" },

  // ══════════════════ SNACKS ══════════════════
  // Dairy & Protein
  { cat: "Snacks", sub: "Dairy & Protein", name: "Greek Yogurt & Honey", cal: 200, p: 20, c: 24, f: 3, prep: "2 min" },
  { cat: "Snacks", sub: "Dairy & Protein", name: "Cottage Cheese & Pineapple", cal: 210, p: 24, c: 20, f: 4, prep: "3 min" },
  { cat: "Snacks", sub: "Dairy & Protein", name: "Hard-Boiled Eggs (2)", cal: 160, p: 13, c: 1, f: 11, prep: "12 min" },
  { cat: "Snacks", sub: "Dairy & Protein", name: "String Cheese & Apple", cal: 220, p: 12, c: 24, f: 9, prep: "2 min" },
  { cat: "Snacks", sub: "Dairy & Protein", name: "Protein Shake & Banana", cal: 280, p: 30, c: 34, f: 3, prep: "3 min" },
  // Nuts & Seeds
  { cat: "Snacks", sub: "Nuts & Seeds", name: "Trail Mix (nuts & dried fruit)", cal: 260, p: 8, c: 24, f: 16, prep: "1 min" },
  { cat: "Snacks", sub: "Nuts & Seeds", name: "Almond Butter Rice Cakes", cal: 230, p: 8, c: 28, f: 11, prep: "3 min" },
  { cat: "Snacks", sub: "Nuts & Seeds", name: "Chia Pudding Cup", cal: 240, p: 10, c: 26, f: 12, prep: "overnight" },
  { cat: "Snacks", sub: "Nuts & Seeds", name: "Pumpkin-Seed & Oat Bites", cal: 210, p: 9, c: 24, f: 10, prep: "15 min" },
  // Fruit
  { cat: "Snacks", sub: "Fruit", name: "Apple with Peanut Butter", cal: 260, p: 8, c: 32, f: 12, prep: "3 min" },
  { cat: "Snacks", sub: "Fruit", name: "Banana & Almonds", cal: 240, p: 7, c: 32, f: 11, prep: "1 min" },
  { cat: "Snacks", sub: "Fruit", name: "Berries & Cream (Greek yogurt)", cal: 180, p: 14, c: 22, f: 3, prep: "3 min" },
  { cat: "Snacks", sub: "Fruit", name: "Orange & Walnuts", cal: 220, p: 6, c: 26, f: 12, prep: "2 min" },
  // Veggie
  { cat: "Snacks", sub: "Veggie", name: "Hummus & Carrot Sticks", cal: 200, p: 8, c: 24, f: 9, prep: "5 min" },
  { cat: "Snacks", sub: "Veggie", name: "Guacamole & Bell Peppers", cal: 190, p: 4, c: 16, f: 14, prep: "5 min" },
  { cat: "Snacks", sub: "Veggie", name: "Edamame with Sea Salt", cal: 190, p: 17, c: 15, f: 8, prep: "6 min" },
  { cat: "Snacks", sub: "Veggie", name: "Cucumber & Tuna Bites", cal: 170, p: 20, c: 6, f: 7, prep: "8 min" },
  { cat: "Snacks", sub: "Dairy & Protein", name: "Turkey Roll-Ups", cal: 180, p: 22, c: 4, f: 9, prep: "5 min" },
  { cat: "Snacks", sub: "Nuts & Seeds", name: "Homemade Granola Bar", cal: 240, p: 8, c: 30, f: 11, prep: "20 min" },
  { cat: "Snacks", sub: "Fruit", name: "Frozen Grape & Yogurt Cup", cal: 170, p: 12, c: 26, f: 2, prep: "3 min" },

  // ══════════════════ PRE-GAME ══════════════════
  // Oats & Grains
  { cat: "Pre-Game", sub: "Oats & Grains", name: "Oatmeal with Banana & Honey", cal: 360, p: 12, c: 68, f: 6, prep: "10 min" },
  { cat: "Pre-Game", sub: "Oats & Grains", name: "Whole-Grain Toast & Jam", cal: 300, p: 9, c: 58, f: 4, prep: "5 min" },
  { cat: "Pre-Game", sub: "Oats & Grains", name: "Bagel with Light Cream Cheese", cal: 340, p: 12, c: 60, f: 6, prep: "5 min" },
  { cat: "Pre-Game", sub: "Oats & Grains", name: "Cereal & Skim Milk", cal: 320, p: 14, c: 62, f: 4, prep: "3 min" },
  { cat: "Pre-Game", sub: "Oats & Grains", name: "Energy Oat Balls", cal: 220, p: 7, c: 34, f: 8, prep: "15 min" },
  // Rice & Pasta
  { cat: "Pre-Game", sub: "Rice & Pasta", name: "Chicken & White-Rice Bowl", cal: 480, p: 36, c: 66, f: 8, prep: "20 min" },
  { cat: "Pre-Game", sub: "Rice & Pasta", name: "Pasta with Marinara", cal: 440, p: 15, c: 82, f: 6, prep: "18 min" },
  { cat: "Pre-Game", sub: "Rice & Pasta", name: "Rice Cakes with Honey", cal: 260, p: 4, c: 58, f: 2, prep: "3 min" },
  { cat: "Pre-Game", sub: "Rice & Pasta", name: "Turkey & Rice Roll", cal: 420, p: 30, c: 56, f: 8, prep: "15 min" },
  // Fruit
  { cat: "Pre-Game", sub: "Fruit", name: "Banana & Peanut Butter", cal: 280, p: 8, c: 40, f: 11, prep: "3 min" },
  { cat: "Pre-Game", sub: "Fruit", name: "Applesauce Pouch & Pretzels", cal: 250, p: 5, c: 56, f: 2, prep: "1 min" },
  { cat: "Pre-Game", sub: "Fruit", name: "Dates & Almonds", cal: 240, p: 6, c: 42, f: 8, prep: "2 min" },
  { cat: "Pre-Game", sub: "Fruit", name: "Fruit Salad Cup", cal: 180, p: 3, c: 44, f: 1, prep: "5 min" },
  { cat: "Pre-Game", sub: "Fruit", name: "Orange Slices & Honey", cal: 160, p: 2, c: 40, f: 0, prep: "3 min" },
  // Smoothies
  { cat: "Pre-Game", sub: "Smoothies", name: "Banana-Berry Fuel Smoothie", cal: 320, p: 12, c: 68, f: 4, prep: "5 min" },
  { cat: "Pre-Game", sub: "Smoothies", name: "Mango-Oat Smoothie", cal: 340, p: 14, c: 66, f: 5, prep: "5 min" },
  { cat: "Pre-Game", sub: "Smoothies", name: "Pineapple-Coconut Water Cooler", cal: 220, p: 3, c: 52, f: 1, prep: "4 min" },
  { cat: "Pre-Game", sub: "Smoothies", name: "Beet & Berry Performance Blend", cal: 260, p: 6, c: 56, f: 2, prep: "5 min" },
  { cat: "Pre-Game", sub: "Oats & Grains", name: "Honey Oat Breakfast Cookie", cal: 240, p: 8, c: 40, f: 7, prep: "18 min" },
  { cat: "Pre-Game", sub: "Rice & Pasta", name: "Cheese & Crackers Plate", cal: 300, p: 12, c: 44, f: 9, prep: "3 min" },

  // ══════════════════ POST-GAME ══════════════════
  // Smoothies & Shakes
  { cat: "Post-Game", sub: "Smoothies & Shakes", name: "Whey & Chocolate Milk Shake", cal: 380, p: 42, c: 48, f: 5, prep: "3 min" },
  { cat: "Post-Game", sub: "Smoothies & Shakes", name: "Berry Recovery Protein Smoothie", cal: 340, p: 34, c: 44, f: 4, prep: "5 min" },
  { cat: "Post-Game", sub: "Smoothies & Shakes", name: "Peanut-Butter Banana Shake", cal: 400, p: 34, c: 46, f: 11, prep: "4 min" },
  { cat: "Post-Game", sub: "Smoothies & Shakes", name: "Tart-Cherry Recovery Blend", cal: 300, p: 26, c: 44, f: 3, prep: "5 min" },
  { cat: "Post-Game", sub: "Smoothies & Shakes", name: "Green Recovery Smoothie", cal: 330, p: 30, c: 42, f: 5, prep: "5 min" },
  // Poultry
  { cat: "Post-Game", sub: "Poultry", name: "Chicken & Rice Recovery Bowl", cal: 520, p: 44, c: 60, f: 10, prep: "20 min" },
  { cat: "Post-Game", sub: "Poultry", name: "Turkey Wrap & Fruit", cal: 460, p: 36, c: 52, f: 12, prep: "12 min" },
  { cat: "Post-Game", sub: "Poultry", name: "Chicken Quesadilla", cal: 540, p: 40, c: 48, f: 20, prep: "18 min" },
  // Rice Bowls
  { cat: "Post-Game", sub: "Rice Bowls", name: "Salmon & Sushi Rice Bowl", cal: 560, p: 40, c: 64, f: 16, prep: "20 min" },
  { cat: "Post-Game", sub: "Rice Bowls", name: "Beef & Rice Burrito Bowl", cal: 580, p: 42, c: 62, f: 18, prep: "22 min" },
  { cat: "Post-Game", sub: "Rice Bowls", name: "Tofu & Rice Recovery Bowl", cal: 480, p: 26, c: 66, f: 12, prep: "20 min" },
  { cat: "Post-Game", sub: "Rice Bowls", name: "Shrimp Fried Brown Rice", cal: 500, p: 34, c: 62, f: 13, prep: "20 min" },
  // Dairy
  { cat: "Post-Game", sub: "Dairy", name: "Greek Yogurt & Granola Bowl", cal: 380, p: 28, c: 50, f: 8, prep: "4 min" },
  { cat: "Post-Game", sub: "Dairy", name: "Cottage Cheese & Fruit Bowl", cal: 300, p: 28, c: 34, f: 5, prep: "4 min" },
  { cat: "Post-Game", sub: "Dairy", name: "Chocolate Milk & Trail Mix", cal: 380, p: 20, c: 48, f: 12, prep: "2 min" },
  { cat: "Post-Game", sub: "Dairy", name: "Skyr with Berries & Honey", cal: 260, p: 24, c: 34, f: 2, prep: "3 min" },
  { cat: "Post-Game", sub: "Smoothies & Shakes", name: "Mocha Protein Shake", cal: 320, p: 34, c: 36, f: 5, prep: "4 min" },
  { cat: "Post-Game", sub: "Poultry", name: "Chicken Pasta Recovery Plate", cal: 620, p: 46, c: 76, f: 14, prep: "25 min" },
  { cat: "Post-Game", sub: "Rice Bowls", name: "Egg & Rice Scramble Bowl", cal: 460, p: 28, c: 58, f: 12, prep: "15 min" },
  { cat: "Post-Game", sub: "Dairy", name: "Ricotta Toast with Honey", cal: 340, p: 18, c: 44, f: 10, prep: "6 min" },
];

// Sub-categories present per meal category, in a sensible display order (derived
// from the seed but stable). Handy for building the sub-category pills.
export const RECIPE_SUBS_BY_CAT = RECIPE_SEED.reduce((acc, r) => {
  (acc[r.cat] = acc[r.cat] || []);
  if (!acc[r.cat].includes(r.sub)) acc[r.cat].push(r.sub);
  return acc;
}, {});

// Recipe docs ready to write to the `recipes` collection (caller adds createdAt).
export const recipeSeedDocs = () => RECIPE_SEED.map((r) => ({ ...r, seeded: true }));
