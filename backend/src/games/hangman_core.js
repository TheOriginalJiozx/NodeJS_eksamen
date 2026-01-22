export function createHangman(word) {
  const secret = String(word || '').toLowerCase();
  /** @type {string[]} */
  const guessed = [];
  let active = true;
  const answer = word;

  function getGame() {
    return {
      maskedWord: secret
        .split('')
        .map(letter => (guessed.includes(letter) ? letter : '_'))
        .join(' '),
      guessed: guessed,
      active: active,
      answer: answer
    };
  }

  function checkLetter(letter) {
    letter = String(letter || '').toLowerCase();
    if (guessed.includes(letter)) throw new Error('The letter has already been guessed');
    guessed.push(letter);
    if (secret.includes(letter)) {
      return { type: 'success', letter, game: getGame() };
    }
    return { type: 'failure', letter, game: getGame() };
  }

  function isGameOver() {
    const won = !secret.split('').some(letter => !guessed.includes(letter));
    const lost = guessed.filter(letter => !secret.includes(letter)).length >= 6;
    if (won || lost) active = false;
    return { gameOver: won || lost, won, lost };
  }

  return { getGame, checkLetter, isGameOver, get active() { return active; }, answer };
}
