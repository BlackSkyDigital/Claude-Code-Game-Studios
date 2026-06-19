# Word Search & Definitions

A simple, self-contained word search web app. Find the hidden words, then click
any word to learn its **definition** and **history (etymology)**.

## How to play

1. Open `index.html` in any web browser (no build step, no server needed).
2. Drag across letters in the grid to select a word. Words can run **forwards,
   backwards, horizontally, vertically, and diagonally**.
3. When you find a word it turns green and its meaning + origin appear on the right.
4. Click any word — in the word list **or** a found word — to revisit its
   definition and history at any time.
5. Use the **Puzzle** dropdown to switch themes, or **New Game** to reshuffle.

## Files

- `index.html` — page structure
- `styles.css` — styling
- `app.js` — grid generation, word placement, selection, and win logic
- `words.js` — the word data (each word includes a definition and a short history)

## Adding your own words

Edit `words.js`. Each puzzle is an object with a `name` and a list of `words`,
where every word has `word`, `definition`, and `history` fields. Keep words
letters-only and uppercase.
