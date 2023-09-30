function normalizeEscape(escape: string) {
  return escape.replace(/([$^\\.()[\]{}*?|])/g, '\\$1')
}

// This function checks if the given code contains LaTeX code, but it's not AsciiMath embed.
function isLatexCode(code: string): boolean {
  const latexRegex = /\\([A-Za-z0-9]){2,}/gm
  const texEmbedRegex = /tex".*"/

  return latexRegex.test(code) && !texEmbedRegex.test(code)
}

export {
  normalizeEscape,
  isLatexCode,
}
