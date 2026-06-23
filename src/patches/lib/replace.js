function replaceOnce(text, oldText, newText, label) {
  const matches = text.split(oldText).length - 1;
  if (matches !== 1) throw new Error(`Expected one ${label}, found ${matches}`);
  return text.replace(oldText, newText);
}

function replaceAllOnce(text, replacements) {
  return replacements.reduce((current, replacement) => {
    const [oldText, newText, label] = replacement;
    return replaceOnce(current, oldText, newText, label);
  }, text);
}

module.exports = {
  replaceAllOnce,
  replaceOnce,
};
