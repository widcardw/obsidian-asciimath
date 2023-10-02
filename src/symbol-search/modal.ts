import { SuggestModal, finishRenderMath, renderMath } from 'obsidian'
import symbols from './symbols.json'

// First is the AsciiMath symbol, second is LaTeX alternative
// The third element is rendered as a preview
type AsciiMathSymbol = [string, string] | [string, string, string]

export class SymbolSearchModal extends SuggestModal<AsciiMathSymbol> {
  private callback: (sym: string) => void

  // Returns all available suggestions.
  getSuggestions(query: string): AsciiMathSymbol[] {
    query = query.toLowerCase()
    return symbols.filter(sym => sym.some(v => v.toLocaleLowerCase().includes(query))) as AsciiMathSymbol[]
  }

  // Renders each suggestion item.
  renderSuggestion([am, latex, toBeRendered]: AsciiMathSymbol, el: HTMLElement) {
    el.classList.add('__asciimath-symbol-search-result')

    const text = el.createDiv()
    text.createEl('div', { text: am })
    text.createEl('small', { text: `LaTeX alternative: ${latex}` })

    el.createDiv('__asciimath-symbol-search-preview math', (el) => {
      el.innerHTML = `
        <mjx-container class="MathJax" jax="CHTML">
        ${renderMath(typeof toBeRendered !== 'undefined' ? toBeRendered : latex, false).innerHTML}
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
    this.callback(sym[0])
  }
}
