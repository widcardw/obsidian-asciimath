import { SuggestModal, finishRenderMath, renderMath } from 'obsidian'
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
  private callback: (sym: AsciiMathSymbol) => void

  // Returns all available suggestions.
  getSuggestions(query: string): AsciiMathSymbol[] {
    query = query.toLowerCase()
    return symbols.filter(sym => ([sym.am, sym.tex]).some(v => v.toLocaleLowerCase().includes(query))) as AsciiMathSymbol[]
  }

  // Renders each suggestion item.
  renderSuggestion(sym: AsciiMathSymbol, el: HTMLElement) {
    const { am, tex, rendered } = sym
    el.classList.add('__asciimath-symbol-search-result')

    const text = el.createDiv()
    const amLine = text.createDiv()
    amLine.createSpan({ text: am })

    if ('placeholder' in sym) {
      const { placeholder, fill } = sym
      // build template like `^(a)_(b)`
      let temp = placeholder
      fill.forEach((x, i) => temp = temp.replace(`$${i + 1}`, x))
      amLine.createSpan({ text: ` ${temp}`, cls: '__asciimath-symbol-search-placeholder' })
    }

    text.createEl('small', { text: `LaTeX alternative: ${tex}` })

    el.createDiv('__asciimath-symbol-search-preview math', (el) => {
      el.innerHTML = `
        <mjx-container class="MathJax" jax="CHTML">
        ${renderMath(typeof rendered !== 'undefined' ? rendered : tex, false).innerHTML}
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
