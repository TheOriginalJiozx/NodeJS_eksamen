/**
 * @param {object|null} game
 * @returns {string}
 */
export function formatHangmanArt(game) {
  if (!game) return '';
  const guessed = Array.isArray(game.guessed) ? game.guessed : [];
  const answer = typeof game.answer === 'string' ? game.answer : '';
  const wrong = guessed.filter((letter) => !answer.includes(letter));
  const stage = Math.min(wrong.length, 6);
  const stages = [
    ' +---+\n |   |\n |\n |\n |\n |\n=====',
    ' +---+\n |   |\n |   O\n |\n |\n |\n=====',
    ' +---+\n |   |\n |   O\n |   |\n |\n |\n=====',
    ' +---+\n |   |\n |   O\n |  /|\n |\n |\n=====',
    ' +---+\n |   |\n |   O\n |  /|\\\n |\n |\n=====',
    ' +---+\n |   |\n |   O\n |  /|\\\n |  /\n |\n=====',
    ' +---+\n |   |\n |   X\n |  /|\\\n |  / \\\n |\n====='
  ];
  return stages[stage];
}

export default formatHangmanArt;
