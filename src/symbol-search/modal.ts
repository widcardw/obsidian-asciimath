import { SuggestModal, finishRenderMath, renderMath } from 'obsidian'
import symbols from './symbols.json'

// First is the AsciiMath symbol, second is LaTeX alternative
// The third element is rendered as a preview
interface AsciiMathSymbol {
  am: string
  tex: string
  rendered?: string
  placeholder?: string
}

export class SymbolSearchModal extends SuggestModal<AsciiMathSymbol> {
  private callback: (sym: string) => void

  // Returns all available suggestions.
  getSuggestions(query: string): AsciiMathSymbol[] {
    query = query.toLowerCase()
    return symbols.filter(sym => ([sym.am, sym.tex]).some(v => v.toLocaleLowerCase().includes(query))) as AsciiMathSymbol[]
  }

  // Renders each suggestion item.
  renderSuggestion({ am, tex, rendered, placeholder }: AsciiMathSymbol, el: HTMLElement) {
    el.classList.add('__asciimath-symbol-search-result')

    const text = el.createDiv()
    const amLine = text.createDiv()// text.createEl('div', { text: am })
    amLine.createSpan({ text: am })
    placeholder && amLine.createSpan({ text: ` ${placeholder}`, cls: '__asciimath-symbol-search-placeholder' })
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

  onSelected(cb: (sym: string) => void) {
    this.callback = cb
  }

  // Perform action on the selected suggestion.
  onChooseSuggestion(sym: AsciiMathSymbol) {
    this.callback(sym.am)
  }
}
