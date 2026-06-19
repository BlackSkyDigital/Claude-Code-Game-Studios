// Word data: each entry has the word plus a definition and a short history (etymology).
// Grouped into themed puzzles. Words are letters-only and uppercased for the grid.
const PUZZLES = [
  {
    name: "Curious Words",
    words: [
      {
        word: "QUARK",
        definition:
          "A fundamental particle of matter that combines to form protons and neutrons.",
        history:
          "Coined by physicist Murray Gell-Mann in 1964. He borrowed the nonsense word from James Joyce's novel 'Finnegans Wake' — the line \"Three quarks for Muster Mark!\" — because quarks come in threes.",
      },
      {
        word: "ROBOT",
        definition: "A machine capable of carrying out a complex series of actions automatically.",
        history:
          "Introduced in the 1920 Czech play 'R.U.R.' by Karel Čapek. It comes from the Czech 'robota', meaning forced labor or drudgery.",
      },
      {
        word: "GALAXY",
        definition: "A vast system of stars, gas, and dust held together by gravity.",
        history:
          "From the Greek 'galaxias', meaning 'milky', referring to the Milky Way. The root 'gala' literally means 'milk'.",
      },
      {
        word: "NEBULA",
        definition: "An interstellar cloud of dust, hydrogen, and other gases.",
        history:
          "Latin for 'mist' or 'cloud'. Astronomers adopted it in the 1700s for fuzzy patches of light in the night sky.",
      },
      {
        word: "PUZZLE",
        definition: "A game or problem designed to test ingenuity or knowledge.",
        history:
          "Of uncertain origin, appearing in English around the 1590s. It may derive from the older word 'pose', meaning to perplex or confound.",
      },
      {
        word: "VOYAGE",
        definition: "A long journey, especially by sea or in space.",
        history:
          "From Old French 'voiage', from Latin 'viaticum' — provisions for a journey — itself from 'via', meaning road or way.",
      },
      {
        word: "ECHO",
        definition: "A sound caused by the reflection of sound waves off a surface.",
        history:
          "From Greek mythology: Echo was a mountain nymph cursed to only repeat the last words spoken to her.",
      },
      {
        word: "CIPHER",
        definition: "A secret or disguised way of writing; a code.",
        history:
          "From Arabic 'sifr', meaning 'empty' or 'zero'. The same root gave us the word 'zero'.",
      },
    ],
  },
  {
    name: "Everyday Origins",
    words: [
      {
        word: "SALARY",
        definition: "A fixed regular payment made by an employer to an employee.",
        history:
          "From Latin 'salarium', money paid to Roman soldiers to buy salt ('sal'). This is the source of the phrase 'worth one's salt'.",
      },
      {
        word: "PANIC",
        definition: "Sudden uncontrollable fear or anxiety.",
        history:
          "From the Greek god Pan, who was said to cause sudden, irrational fear in lonely places — 'panikon deima', the fear of Pan.",
      },
      {
        word: "MUSCLE",
        definition: "A band of tissue in the body that produces movement.",
        history:
          "From Latin 'musculus', meaning 'little mouse' — Romans thought a flexing muscle looked like a mouse moving under the skin.",
      },
      {
        word: "JEANS",
        definition: "Hard-wearing trousers made of denim.",
        history:
          "Named after Genoa, Italy ('Gênes' in French), where the sturdy cotton fabric was originally made for sailors.",
      },
      {
        word: "SANDWICH",
        definition: "Two or more slices of bread with a filling between them.",
        history:
          "Named after John Montagu, the 4th Earl of Sandwich, who in the 1760s asked for meat between bread so he could eat without leaving the card table.",
      },
      {
        word: "NICE",
        definition: "Pleasant, agreeable, or satisfactory.",
        history:
          "Originally from Latin 'nescius', meaning 'ignorant'. Over centuries it shifted through 'foolish', 'precise', and finally to 'pleasant'.",
      },
      {
        word: "DENIM",
        definition: "A sturdy cotton twill fabric, typically blue.",
        history:
          "From the French 'serge de Nîmes' — a fabric from the city of Nîmes — shortened to 'de Nîmes', then 'denim'.",
      },
      {
        word: "QUARANTINE",
        definition: "A period of isolation to prevent the spread of disease.",
        history:
          "From the Italian 'quaranta giorni', meaning 'forty days' — the time ships were kept isolated during the Black Death in Venice.",
      },
    ],
  },
  {
    name: "Nature & Science",
    words: [
      {
        word: "OXYGEN",
        definition: "A colorless gas essential for most life and combustion.",
        history:
          "Coined by chemist Antoine Lavoisier in 1777 from Greek 'oxys' (sharp/acid) and 'genes' (forming), as he mistakenly thought it formed all acids.",
      },
      {
        word: "POLLEN",
        definition: "A fine powder produced by plants for reproduction.",
        history:
          "Latin for 'fine flour' or 'dust'. The botanical meaning was fixed by Carl Linnaeus in the 1700s.",
      },
      {
        word: "VOLCANO",
        definition: "A mountain that erupts molten rock, ash, and gases.",
        history:
          "Named after Vulcan, the Roman god of fire and metalworking, whose forge was said to lie beneath Mount Etna.",
      },
      {
        word: "GLACIER",
        definition: "A slowly moving mass of ice formed from compacted snow.",
        history:
          "From the French 'glace', meaning ice, ultimately from Latin 'glacies'.",
      },
      {
        word: "GRAVITY",
        definition: "The force that attracts objects toward one another.",
        history:
          "From Latin 'gravitas', meaning weight or heaviness. Newton gave it its modern scientific meaning in the 1600s.",
      },
      {
        word: "FOSSIL",
        definition: "The preserved remains or trace of an ancient organism.",
        history:
          "From Latin 'fossilis', meaning 'dug up', from 'fodere', to dig.",
      },
      {
        word: "COMET",
        definition: "An icy body that releases a glowing tail when near the Sun.",
        history:
          "From Greek 'kometes', meaning 'long-haired', because the tail looked like flowing hair.",
      },
      {
        word: "ENZYME",
        definition: "A protein that speeds up chemical reactions in living things.",
        history:
          "Coined in 1878 from Greek 'en' (in) and 'zyme' (leaven/yeast), since the first ones studied acted like the agents in fermentation.",
      },
    ],
  },
];
