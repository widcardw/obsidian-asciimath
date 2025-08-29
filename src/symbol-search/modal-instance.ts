import { Editor } from "obsidian"
import { SymbolSearchModal } from "./modal"

function createModalInstance(editor: Editor) {
  const sel = editor.getSelection()
  const modal = new SymbolSearchModal(this.app, sel, this.AM)
  modal.setPlaceholder('Start typing AsciiMath or LaTeX symbol name')

  modal.onSelected((sym) => {
    const { am } = sym
    if ('placeholder' in sym) {
      const { placeholder, fill } = sym

      // build template like `($1) ()()`
      let tempExceptFirst = placeholder
      for (let i = 2; i <= fill.length; i++)
        tempExceptFirst = tempExceptFirst.replace(`$${i}`, '')

      // remove the first dollar
      const temp = tempExceptFirst.replace('$1', '')
      if (!sel) {
        // No selection, then place the cursor at `$1`.
        const cur = editor.getCursor()
        const placeholder_a_pos = placeholder.indexOf('$1')
        const spacesBefore$1 =
          placeholder
            .substring(0, placeholder_a_pos)
            .match(/(\$\d+?)/g)
            ?.join('').length || 0
        editor.replaceSelection(am + temp)
        editor.setCursor({
          line: cur.line,
          ch: cur.ch + am.length + placeholder_a_pos - spacesBefore$1,
        })
      } else {
        // There is a selection, then replace `$1` with the selection, and put the cursor at `$2`.
        const placeholder_b_pos = placeholder.indexOf('$2')
        const cur = editor.getCursor('to')
        editor.replaceSelection(am + tempExceptFirst.replace('$1', sel))
        if (placeholder_b_pos !== -1) {
          // Calculate how many `(\$\d+)`s are before `$2`,
          // then we should move the cursor to the location of `$2`.
          // This code is specially for `pp` and `dd` syntax sugar, which covers common cases.
          /**
           * abc
           *    ^ cursor here
           *
           * pp ^$3 ($1)($2)
           *     ^^ $spacesBefore$2 = 2
           *
           * pp ^ (abc)()
           *           ^^ cursor should be here
           */
          const $before$2 = placeholder
            .substring(0, placeholder_b_pos)
            .match(/(\$\d+?)/g)
          const $spacesBefore$2 = $before$2?.join('').length || 0
          // if $1 is located after $2, then the cursor should move back
          /**
           * abc
           *    ^ cursor here
           *
           * color($2)($1)
           *       ^^ $2before$1
           *
           * color()(abc)
           *      ^^ cursor should be here, it will be moved back the length of `abc`
           */
          const $2before$1 =
            !$before$2 || !$before$2.includes('$1') ? sel.length : 0
          editor.setCursor({
            line: cur.line,
            ch:
              cur.ch +
              am.length +
              placeholder_b_pos -
              $spacesBefore$2 -
              $2before$1,
          })
        } else {
          editor.setCursor({
            line: cur.line,
            ch: cur.ch + am.length + placeholder.length - 2,
          })
        }
      }
    } else {
      editor.replaceSelection(am)
    }
  })
  modal.open()
}

export {
  createModalInstance
}
