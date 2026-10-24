// The example questions on the home page's start screen (one per kind the brief asked for: the travel claim, where
// to look for a given base, BAH for a grade, the base housing wait). scripts/check_frontend.mjs runs each through
// retrieval against the built corpus and fails one that would get "I don't have that".
export const EXAMPLE_QUESTIONS = [
  { id: 'travel-claim', text: 'How do I file my PCS travel claim?' },
  { id: 'where-pendleton', text: 'Which neighborhoods are closest to Camp Pendleton?' },
  { id: 'bah-grade', text: 'What’s the BAH for an E5 with dependents at Naval Base San Diego?' },
  { id: 'housing-wait', text: 'How long is the base housing wait at Murphy Canyon?' },
];
