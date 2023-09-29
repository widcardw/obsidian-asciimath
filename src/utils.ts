function normalizeEscape(escape: string) {
  return escape.replace(/([$^\\.()[\]{}*?|])/g, '\\$1')
}

const latexRegex = /\\([A-Za-z0-9]){2,}/gm
const texEmbedRegex = /tex".*"/
// This function checks if the given code contains LaTeX code, but it's not AsciiMath embed.
function isLatexCode(code: string): boolean {
  return latexRegex.test(code) && !texEmbedRegex.test(code)
}

export {
  normalizeEscape,
  isLatexCode,
}
