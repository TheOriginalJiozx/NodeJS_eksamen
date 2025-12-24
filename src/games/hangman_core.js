/**
 * @param {string} word
 */
export function createHangman(word) {
  const secret = String(word || '').toLowerCase();
  /** @type {string[]} */
  const guessed = [];
  let active = true;
  const answer = word;

  /**
   * @returns {{maskedWord: string, guessed: string[], active: boolean, answer: string}}
   */
  function getGame() {
    return {
      maskedWord: secret
        .split('')
        .map(l => (guessed.includes(l) ? l : '_'))
        .join(' '),
      guessed: guessed,
      active: active,
      answer: answer
    };
  }

  /**
   * @param {string} letter
   * @returns {{type: string, letter: string, game: ReturnType<typeof getGame>}}
   */
  function checkLetter(letter) {
    letter = String(letter || '').toLowerCase();
    if (guessed.includes(letter)) throw new Error('Bogstaven er allerede gættet');
    guessed.push(letter);
    if (secret.includes(letter)) {
      return { type: 'success', letter, game: getGame() };
    }
    return { type: 'failure', letter, game: getGame() };
  }

  /**
   * @returns {{gameOver: boolean}}
   */
  function isGameOver() {
    const won = !secret.split('').some(l => !guessed.includes(l));
    const lost = guessed.filter(l => !secret.includes(l)).length >= 6;
    if (won || lost) active = false;
    return { gameOver: won || lost };
  }

  return { getGame, checkLetter, isGameOver, get active() { return active; }, answer };
}
