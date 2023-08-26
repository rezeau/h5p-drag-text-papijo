import Util from './util';

/**
 * Parses a text into an array where words starting and ending
 * with an asterisk are separated from other text.
 * e.g ["this", "*is*", " an ", "*example*"]
 *
 * @param {string} text
 *
 * @return {string[]}
 */

const parseText = text => text.split(/(\*.*?\*)/).filter(str => str.length > 0);

/**
 * @typedef {object} Solution
 * @param {string} tip
 * @param {string} correct
 * @param {string} incorrect
 * @param {string} text
 */
/**
 * Parse the solution text (text between the asterisks)
 *
 * @param {string} solutionText
 * @returns {Solution}
 */
const lex = solutionText => {
  let tip = solutionText.match(/(:([^\\*]+))/g);
  let removableBlock = solutionText.match(/(_([^\\*]+)_)/g);
  let correctFeedback = solutionText.match(/(\\\+([^\\*:]+))/g);
  let incorrectFeedback = solutionText.match(/(\\\-([^\\*:]+))/g);

  // Strip the tokens
  let text = Util.cleanCharacter('*', solutionText);

  if (tip) {
    const DUMMYCHARACTER = '\u200B'; // zero-width space character
    text = text.replace(tip, '');
    tip = tip[0].replace(':', '');
    tip = tip.replace(/\s+$/, '');
    // If tip contains a reference to an image and no text, it needs some character, so we add an invisible one.
    if ((tip.substr(0, 4) === '<img')) {
      tip = tip.replace('<img', DUMMYCHARACTER + '​<img');
    }
  }
  if (correctFeedback) {
    text = text.replace(correctFeedback, '');
    correctFeedback = correctFeedback[0].replace('\\+', '');
    correctFeedback = correctFeedback.replace(/\s+$/, '');
  }
  if (incorrectFeedback) {
    text = text.replace(incorrectFeedback, '');
    incorrectFeedback = incorrectFeedback[0].replace('\\-', '');
    incorrectFeedback = incorrectFeedback.replace(/\s+$/, '');
  }

  if (removableBlock) {
    text = text.replace(removableBlock, '');
    removableBlock = removableBlock[0].replace('\\-', '');
    removableBlock = removableBlock.replace(/_/gm,'');
  }

  text = text.replace(/\s+$/, ''); // remove trailing spaces and tabs
  return { tip, correctFeedback, incorrectFeedback, removableBlock, text };
};

export { parseText, lex };
