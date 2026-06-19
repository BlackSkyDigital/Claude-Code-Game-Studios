"use strict";

// ---- State ----
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIRECTIONS = [
  [0, 1],   // right
  [0, -1],  // left
  [1, 0],   // down
  [-1, 0],  // up
  [1, 1],   // down-right
  [-1, -1], // up-left
  [1, -1],  // down-left
  [-1, 1],  // up-right
];

let gridSize = 12;
let grid = [];          // 2D array of letters
let placements = [];    // { word, cells: [{r,c}], found }
let currentPuzzle = null;

// Selection state
let selecting = false;
let startCell = null;
let activeCells = [];

// ---- DOM ----
const gridEl = document.getElementById("grid");
const wordListEl = document.getElementById("word-list");
const statusEl = document.getElementById("status");
const infoCardEl = document.getElementById("info-card");
const puzzleSelect = document.getElementById("puzzle-select");
const newGameBtn = document.getElementById("new-game");

// ---- Grid building ----
function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

function inBounds(r, c) {
  return r >= 0 && r < gridSize && c >= 0 && c < gridSize;
}

function tryPlaceWord(word) {
  const attempts = 200;
  for (let i = 0; i < attempts; i++) {
    const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const r0 = Math.floor(Math.random() * gridSize);
    const c0 = Math.floor(Math.random() * gridSize);
    const cells = [];
    let ok = true;

    for (let k = 0; k < word.length; k++) {
      const r = r0 + dir[0] * k;
      const c = c0 + dir[1] * k;
      if (!inBounds(r, c)) {
        ok = false;
        break;
      }
      const existing = grid[r][c];
      if (existing !== "" && existing !== word[k]) {
        ok = false;
        break;
      }
      cells.push({ r, c });
    }

    if (ok) {
      cells.forEach((cell, k) => {
        grid[cell.r][cell.c] = word[k];
      });
      return cells;
    }
  }
  return null;
}

function fillBlanks() {
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c] === "") {
        grid[r][c] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      }
    }
  }
}

function buildPuzzle(puzzle) {
  currentPuzzle = puzzle;
  // Size grid to the longest word, with a little padding.
  const longest = Math.max(...puzzle.words.map((w) => w.word.length));
  gridSize = Math.max(12, longest + 2);

  // Sort longest-first for better packing.
  const sorted = [...puzzle.words].sort((a, b) => b.word.length - a.word.length);

  // Retry whole-board generation until every word fits.
  let success = false;
  for (let attempt = 0; attempt < 25 && !success; attempt++) {
    grid = emptyGrid(gridSize);
    placements = [];
    success = true;
    for (const entry of sorted) {
      const cells = tryPlaceWord(entry.word);
      if (!cells) {
        success = false;
        break;
      }
      placements.push({ ...entry, cells, found: false });
    }
  }

  fillBlanks();
  renderGrid();
  renderWordList();
  clearInfo();
  statusEl.textContent = "";
  statusEl.classList.remove("win-banner");
}

// ---- Rendering ----
function renderGrid() {
  gridEl.style.gridTemplateColumns = `repeat(${gridSize}, auto)`;
  gridEl.innerHTML = "";
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = grid[r][c];
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.setAttribute("role", "gridcell");
      gridEl.appendChild(cell);
    }
  }
}

function renderWordList() {
  wordListEl.innerHTML = "";
  // Preserve original puzzle order in the list.
  currentPuzzle.words.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = entry.word;
    li.dataset.word = entry.word;
    const placement = placements.find((p) => p.word === entry.word);
    if (placement && placement.found) li.classList.add("found");
    li.addEventListener("click", () => {
      showInfo(entry.word);
      setActiveWord(entry.word);
    });
    wordListEl.appendChild(li);
  });
}

function cellEl(r, c) {
  return gridEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
}

// ---- Selection logic ----
function lineBetween(a, b) {
  const dr = Math.sign(b.r - a.r);
  const dc = Math.sign(b.c - a.c);
  const rowDiff = Math.abs(b.r - a.r);
  const colDiff = Math.abs(b.c - a.c);

  // Only straight lines (horizontal, vertical, perfect diagonal).
  const straight =
    rowDiff === 0 || colDiff === 0 || rowDiff === colDiff;
  if (!straight) return null;

  const length = Math.max(rowDiff, colDiff);
  const cells = [];
  for (let k = 0; k <= length; k++) {
    cells.push({ r: a.r + dr * k, c: a.c + dc * k });
  }
  return cells;
}

function clearSelectingClass() {
  activeCells.forEach((cell) => {
    const el = cellEl(cell.r, cell.c);
    if (el && !el.classList.contains("found")) el.classList.remove("selecting");
  });
}

function paintSelection(cells) {
  clearSelectingClass();
  activeCells = cells || [];
  activeCells.forEach((cell) => {
    const el = cellEl(cell.r, cell.c);
    if (el) el.classList.add("selecting");
  });
}

function getCellFromEvent(e) {
  const target = document.elementFromPoint(
    e.clientX ?? (e.touches && e.touches[0].clientX),
    e.clientY ?? (e.touches && e.touches[0].clientY)
  );
  if (target && target.classList.contains("cell")) {
    return { r: +target.dataset.r, c: +target.dataset.c };
  }
  return null;
}

function startSelect(e) {
  const cell = getCellFromEvent(e);
  if (!cell) return;
  selecting = true;
  startCell = cell;
  paintSelection([cell]);
  e.preventDefault();
}

function moveSelect(e) {
  if (!selecting || !startCell) return;
  const cell = getCellFromEvent(e);
  if (!cell) return;
  const line = lineBetween(startCell, cell);
  if (line) paintSelection(line);
  e.preventDefault();
}

function endSelect(e) {
  if (!selecting) return;
  selecting = false;
  evaluateSelection();
  clearSelectingClass();
  activeCells = [];
  startCell = null;
}

function selectionWord(cells) {
  return cells.map((c) => grid[c.r][c.c]).join("");
}

function evaluateSelection() {
  if (activeCells.length < 2) return;
  const forward = selectionWord(activeCells);
  const backward = forward.split("").reverse().join("");

  for (const placement of placements) {
    if (placement.found) continue;
    if (placement.word === forward || placement.word === backward) {
      markFound(placement);
      return;
    }
  }
}

function markFound(placement) {
  placement.found = true;
  placement.cells.forEach((cell) => {
    const el = cellEl(cell.r, cell.c);
    if (el) {
      el.classList.remove("selecting");
      el.classList.add("found");
    }
  });

  const li = wordListEl.querySelector(`li[data-word="${placement.word}"]`);
  if (li) li.classList.add("found");

  statusEl.textContent = `Found "${placement.word}"! Click it to learn its story.`;
  showInfo(placement.word);
  setActiveWord(placement.word);
  checkWin();
}

function checkWin() {
  if (placements.every((p) => p.found)) {
    statusEl.textContent = "🎉 You found every word! Try another puzzle.";
    statusEl.classList.add("win-banner");
  }
}

// ---- Info card ----
function entryFor(word) {
  return currentPuzzle.words.find((w) => w.word === word);
}

function showInfo(word) {
  const entry = entryFor(word);
  if (!entry) return;
  infoCardEl.innerHTML = `
    <h3>${entry.word}</h3>
    <p class="label">Definition</p>
    <p>${entry.definition}</p>
    <p class="label">History &amp; Origin</p>
    <p>${entry.history}</p>
  `;
}

function clearInfo() {
  infoCardEl.innerHTML =
    '<p class="info-empty">Select a word to reveal its definition and history.</p>';
}

function setActiveWord(word) {
  wordListEl.querySelectorAll("li").forEach((li) => {
    li.classList.toggle("active", li.dataset.word === word);
  });
}

// ---- Wiring ----
function populatePuzzleSelect() {
  PUZZLES.forEach((p, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = p.name;
    puzzleSelect.appendChild(opt);
  });
}

function currentPuzzleIndex() {
  return Number(puzzleSelect.value) || 0;
}

// Pointer + touch events on the grid.
gridEl.addEventListener("mousedown", startSelect);
gridEl.addEventListener("mousemove", moveSelect);
document.addEventListener("mouseup", endSelect);

gridEl.addEventListener("touchstart", startSelect, { passive: false });
gridEl.addEventListener("touchmove", moveSelect, { passive: false });
document.addEventListener("touchend", endSelect);

puzzleSelect.addEventListener("change", () =>
  buildPuzzle(PUZZLES[currentPuzzleIndex()])
);
newGameBtn.addEventListener("click", () =>
  buildPuzzle(PUZZLES[currentPuzzleIndex()])
);

// ---- Boot ----
populatePuzzleSelect();
buildPuzzle(PUZZLES[0]);
