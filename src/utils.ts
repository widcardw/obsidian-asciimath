import { AsciiMath } from "asciimath-parser"


interface FormulaMatch {
  type: "inline" | "block";
  start: number;
  end: number;
  content: string;
}


function normalizeEscape(escape_: string) {
  return escape_.replace(/([$^\\.()[\]{}*?|])/g, '\\$1')
}

// This function checks if the given code contains LaTeX code, but it's not AsciiMath embed.
function isLatexCode(code: string): boolean {
  const latexRegex = /\\([A-Za-z0-9]){2,}/gm
  const simpleLatexSupSubRegex = /[\^_]\{\s*[a-zA-Z0-9 ]+\s*\}/g
  const texEmbedRegex = /tex".*"/

  const hasTrueLatex = latexRegex.test(code)
  const hasSimpleLatexSupSub = simpleLatexSupSubRegex.test(code)
  const hasTexEmbed = texEmbedRegex.test(code)

  return (hasTrueLatex || (hasSimpleLatexSupSub && !hasTrueLatex)) && !hasTexEmbed
}

function toTex(am: AsciiMath, content: string, displayMode: boolean): string {
  const tex = am.toTex(content, { display: displayMode })
  return tex.replace(/(\{|\})(\1+)/g, (...args) =>
    Array(args[2].length + 1)
      .fill(args[1])
      .join(' '),
  )
}


export { normalizeEscape, isLatexCode, toTex }
export type { FormulaMatch }
