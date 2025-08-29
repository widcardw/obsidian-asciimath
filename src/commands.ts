import type { Command, Editor, MarkdownView } from "obsidian";
import { createModalInstance } from "./symbol-search/modal-instance";
import type AsciiMathPlugin from "./main";
import { ConfirmModal } from "./confirm-modal";
import dedent from "ts-dedent";
import { isLatexCode } from "./utils";
import { actionConvertActiveFile, actionConvertEntireVault } from "./convertion";

function initCommands(plugin: AsciiMathPlugin) {
  const commands: Command[] = [
    {
      id: 'asciimath-insert-symbol',
      icon: 'sigma',
      name: 'View AsciiMath symbols',
      editorCallback: (editor) => {
        createModalInstance(editor)
      },
    },
    {
      id: 'insert-asciimath-block',
      name: 'Insert asciimath block',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        editor.replaceSelection(
          `\`\`\`${plugin.settings.blockPrefix[0] || 'asciimath'}\n${editor
            .getDoc()
            .getSelection()}\n\`\`\``,
        )
        const cursor = editor.getCursor()
        editor.setCursor(cursor.line - 1)
      },
    },
    {
      id: 'convert-selected-to-latex',
      name: 'Convert exact selection into LaTeX',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        const cursorStart = editor.getCursor('from')
        const cursorEnd = editor.getCursor('to')
        const amCode = editor.getSelection()
        const doConvert = () =>
          editor.replaceRange(plugin.AM.toTex(amCode), cursorStart, cursorEnd)

        if (amCode.length > 1000) {
          new ConfirmModal(plugin.app)
            .setMessage(
              dedent`The selection is over 1000 chars.
                     Please confirm that you have selected the exact AsciiMath expression.
                     Click the Continue button to convert though.`,
            )
            .onConfirm(doConvert)
            .open()
        } else if (isLatexCode(amCode)) {
          new ConfirmModal(plugin.app)
            .setMessage(
              dedent`The selection may be already LaTeX.
                   Click the Continue buttom to convert though.`,
            )
            .onConfirm(doConvert)
            .open()
        } else {
          doConvert()
        }
      },
    },
    {
      id: 'convert-am-block-into-mathjax-in-current-file',
      name: 'Convert AsciiMath to LaTeX (active file)',
      callback: actionConvertActiveFile(
        plugin,
        'This will replace all AsciiMath blocks with LaTeX math blocks in the active file. THIS ACTION CANNOT BE UNDONE.',
      ),
    },
    {
      id: 'convert-am-block-into-mathjax-in-vault',
      name: 'Convert AsciiMath to LaTeX (entire vault)',
      callback: actionConvertEntireVault(
        plugin,
        'This will replace all AsciiMath formulas with LaTeX math blocks in the entire vault. THIS ACTION CANNOT BE UNDONE.',
      ),
    }
  ]

  commands.forEach((command) => {
    plugin.addCommand(command)
  })
}

export { initCommands }