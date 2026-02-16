import logger from '../../../lib/logger.js';
import { toast } from 'svelte-5-french-toast';

/**
 * @param {() => any} getClient
 * @param {() => { username?: string }} getUserData
 * @param {() => string} getHostWord
 * @param {() => string|null} getSelectedRoomId
 * @param {() => string} getLetter
 * @param {(value:string) => void} setLetter
 * @param {() => string} getChatInput
 * @param {(value:string) => void} setChatInput
 */
export function createHangmanActions(
  getClient,
  getUserData,
  getHostWord,
  getSelectedRoomId,
  getLetter,
  setLetter,
  getChatInput,
  setChatInput,
) {
  function start() {
    const client = getClient();
    if (!client) return;
    const word = String((getHostWord() || '').trim());
    const user = getUserData();
    const name = user && user.username ? user.username : '';
    if (!word) {
      try {
        toast.error('Please supply a word to start the game');
      } catch (error) {}
      return;
    }
    client.start(name, word);
  }

  function join() {
    const client = getClient();
    if (!client) return;
    const user = getUserData();
    const name = user && user.username ? user.username : '';
    client.join(name, getSelectedRoomId());
  }

  function guess() {
    const client = getClient();
    const letter = getLetter();
    if (!client || !letter) return;
    client.guess(letter);
    try {
      setLetter('');
    } catch {
      logger.debug('Could not clear letter input after guess');
    }
  }

  function sendChat() {
    const client = getClient();
    const message = String((getChatInput() || '').trim());
    if (!client || !message) return;
    client.sendChat(message);
    try {
      setChatInput('');
    } catch {
      logger.debug('Could not clear chat input after sending message');
    }
  }

  return { start, join, guess, sendChat };
}

export default createHangmanActions;
