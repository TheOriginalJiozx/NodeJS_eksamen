import logger from './logger.js';

const gradients = [
  'from-red-700 via-red-900 to-black',
  'from-indigo-700 via-purple-700 to-fuchsia-600',
  'from-orange-500 via-pink-500 to-rose-600',
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-green-400 via-lime-400 to-yellow-400',
  'from-blue-400 via-cyan-400 to-indigo-400',
  'from-red-500 via-orange-500 to-yellow-500',
  'from-pink-500 via-fuchsia-500 to-purple-500',
  'from-teal-400 via-cyan-500 to-blue-600',
  'from-purple-700 via-pink-600 to-orange-500',
  'from-lime-400 via-green-500 to-teal-500',
  'from-yellow-400 via-orange-400 to-red-500',
];

/**
 * @param {{ update: (function: (current: string) => string) => void }} backgroundGradient
 */
export function changeColor(backgroundGradient) {
  backgroundGradient.update(current => {
    let next;
    do {
      next = gradients[Math.floor(Math.random() * gradients.length)];
    } while (next === current);
    try {
        logger.debug(`Changed gradient from "${current}" to "${next}"`);
    } catch (error) {
        logger.debug({ error }, 'changeColor: logger failed');
    }
    return next;
  });
}
