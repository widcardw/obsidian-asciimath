import type { App } from 'obsidian'
import { SuggestModal, finishRenderMath, renderMath } from 'obsidian'
import type { AsciiMath } from 'asciimath-parser'
import symbols from './symbols.json'

// First is the AsciiMath symbol, second is LaTeX alternative
// The third element is rendered as a preview

type AsciiMathSymbol = { am: string; tex: string; rendered?: string }
| {
  am: string
  tex: string
  rendered?: string
  placeholder: string
  fill: Array<string>
}

export class SymbolSearchModal extends SuggestModal<AsciiMathSymbol> {
  private sel: string
  private am: AsciiMath
  private callback: (sym: AsciiMathSymbol) => void

  constructor(app: App, sel: string, am: AsciiMath) {
    super(app)
    this.sel = sel
    this.am = am
  }

  // Returns all available suggestions.
  getSuggestions(query: string): AsciiMathSymbol[] {
    query = query.toLowerCase()
    return symbols.filter(sym => ([sym.am, sym.tex]).some(v => v.toLocaleLowerCase().includes(query))) as AsciiMathSymbol[]
  }

  // Renders each suggestion item.
  renderSuggestion(sym: AsciiMathSymbol, el: HTMLElement) {
    let { am, tex, rendered } = sym
    el.classList.add('__asciimath-symbol-search-result')

    const text = el.createDiv()
    const amLine = text.createDiv()
    amLine.createSpan({ text: am })

    let toBeRendered = typeof rendered !== 'undefined' ? rendered : tex

    if ('placeholder' in sym) {
      const { placeholder, fill } = sym
      // build template like `^(a)_(b)`
      let template = placeholder
      if (this.sel) {
        // if `am` is embedded LaTeX, then just render the selection as LaTeX, otherwise render the parsed tex.
        const selToTex = (am === 'tex' || am === 'text') ? this.sel : this.am.toTex(this.sel, { display: false })
        template = template.replace('$1', this.sel)

        tex = tex.replace('$1', selToTex)
        toBeRendered = toBeRendered.replace('$1', selToTex)
      }

      fill.forEach((x, i) => {
        template = template.replace(`$${i + 1}`, x)
        toBeRendered = toBeRendered.replaceAll(`$${i + 1}`, x)
        tex = tex.replaceAll(`$${i + 1}`, x)
      })
      amLine.createSpan({ text: ` ${template}`, cls: '__asciimath-symbol-search-placeholder' })
    }

    text.createEl('small', { text: `LaTeX alternative: ${tex}` })

    el.createDiv('__asciimath-symbol-search-preview math', (el) => {
      if (am === 'tex')
        toBeRendered = `tex"${toBeRendered}"`

      el.innerHTML = `
        <mjx-container class="MathJax" jax="CHTML">
        ${renderMath(toBeRendered, false).innerHTML}
        </mjx-container>
      `
      finishRenderMath()
    })
  }

  onSelected(cb: (sym: AsciiMathSymbol) => void) {
    this.callback = cb
  }

  // Perform action on the selected suggestion.
  onChooseSuggestion(sym: AsciiMathSymbol) {
    this.callback(sym)
  }
}
