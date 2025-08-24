function normalizeEscape(escape_: string) {
  return escape_.replace(/([$^\\.()[\]{}*?|])/g, '\\$1')
}

// This function checks if the given code contains LaTeX code, but it's not AsciiMath embed.
function isLatexCode(code: string): boolean {
  const latexRegex = /\\([A-Za-z0-9]){2,}/gm
  const simpleLatexSupSubRegex = /[\^_]\\{?[a-zA-Z0-9]\\}?/gm
  const texEmbedRegex = /tex".*"/

  const hasTrueLatex = latexRegex.test(code)
  const hasSimpleLatexSupSub = simpleLatexSupSubRegex.test(code)
  const hasTexEmbed = texEmbedRegex.test(code)

  return (hasTrueLatex || (hasSimpleLatexSupSub && !hasTrueLatex)) && !hasTexEmbed
}

export { normalizeEscape, isLatexCode }
