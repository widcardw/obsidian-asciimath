import type {
  Editor,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownView,
  TFile,
} from 'obsidian'
import {
  MarkdownPreviewRenderer,
  Modal,
  Notice,
  Plugin,
  Setting,
  finishRenderMath,
  loadMathJax,
  renderMath,
} from 'obsidian'

import { AsciiMath, TokenTypes } from 'asciimath-parser'
import dedent from 'ts-dedent'
import { ConfirmModal } from './confirm-modal'
import { inlinePlugin } from './inline'
import { AsciiMathSettingTab, type AsciiMathSettings } from './settings'
import { SymbolSearchModal } from './symbol-search/modal'
import { isLatexCode, normalizeEscape } from './utils'

enum ConvertTarget {
  Asciimath = 'Asciimath',
  Tex = 'Tex',
}

const DEFAULT_SETTINGS: AsciiMathSettings = {
  blockPrefix: ['asciimath', 'am'],
  disableDeprecationWarning: false,
  replaceMathBlock: true,
  inline: {
    open: '`$',
    close: '$`',
  },
  customSymbols: [],
}

function toTex(am: AsciiMath, content: string): string {
  const tex = am.toTex(content)
  return tex.replace(/(\{|\})(\1+)/g, (...args) =>
    Array(args[2].length + 1)
      .fill(args[1])
      .join(' '),
  )
}

export default class AsciiMathPlugin extends Plugin {
  settings: AsciiMathSettings
  existPrefixes: string[] = []
  tex2chtml: (source: string, r: { display: boolean }) => any

  postProcessors: Map<string, MarkdownPostProcessor> = new Map()

  AM: AsciiMath

  calcSymbols() {
    return this.settings.customSymbols.map(([k, v]) => {
      return [k, { type: TokenTypes.Const, tex: v }] as [
        string,
        { type: TokenTypes; tex: string },
      ]
    })
  }

  onunload() {
    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath unloaded')

    // Resetting mathjax rendering function to default
    MathJax.tex2chtml = this.tex2chtml

    // this.postProcessors = null
    this.unregister()
  }

  unregister() {
    this.postProcessors.forEach((value) => {
      MarkdownPreviewRenderer.unregisterPostProcessor(value)
    })
    this.postProcessors.clear()
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  // This will hijack function that is used by obsidian for rendering math.
  setupMathBlockRendering() {
    this.tex2chtml = MathJax.tex2chtml

    if (this.settings.replaceMathBlock)
      MathJax.tex2chtml = (s, r) => this.convertMathCode(s, r)
    else MathJax.tex2chtml = this.tex2chtml
  }

  // Converts AsciiMath (if used in the current block) to tex and then calls default tex2chtml function
  convertMathCode(source: string, r: { display: boolean }) {
    if (this.settings.replaceMathBlock && !isLatexCode(source))
      source = this.AM.toTex(source)

    return this.tex2chtml(source, r)
  }

  registerAsciiMathCodeBlock(prefix: string) {
    this.postProcessors.set(
      prefix,
      this.registerMarkdownCodeBlockProcessor(prefix, (src, el, ctx) =>
        this.postProcessor(prefix, src, el, ctx),
      ),
    )
  }

  postProcessor(
    _prefix: string,
    src: string,
    el: HTMLElement,
    _?: MarkdownPostProcessorContext,
  ) {
    const mathEl = renderMath(src, true)
    el.appendChild(mathEl)
    finishRenderMath()
  }

  async onload() {
    await this.loadSettings()

    await loadMathJax()

    this.AM = new AsciiMath({
      symbols: this.calcSymbols(),
    })

    if (!MathJax) {
      console.warn('MathJax was not defined despite loading it.')
      new Notice('Error: MathJax was not defined despite loading it!')
      return
    }

    // Deprecation warning for the inline math syntax
    this.app.workspace.on('file-open', async (file) => {
      if (!file || this.settings.disableDeprecationWarning) return

      const content = await this.app.vault.read(file)
      const [open, close] = Object.values(this.settings.inline).map(
        normalizeEscape,
      )
      const inlineReg = new RegExp(`${open}(.*?)${close}`, 'g')
      if (inlineReg.test(content)) {
        new Notice(
          dedent`
          Obsidian AsciiMath:

          Inline math with single backticks is deprecated. Refer to the plugin description to fix this issue.
          You also can disable this warning in the plugin settings.

          Click here to dismiss this message.
        `,
          0,
        )
      }
    })

    this.addCommand({
      id: 'asciimath-insert-symbol',
      icon: 'sigma',
      name: 'View AsciiMath symbols',
      editorCallback: this.modalCallback(),
    })

    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: 'insert-asciimath-block',
      name: 'Insert asciimath block',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        editor.replaceSelection(
          `\`\`\`${this.settings.blockPrefix[0] || 'asciimath'}\n${editor
            .getDoc()
            .getSelection()}\n\`\`\``,
        )
        const cursor = editor.getCursor()
        editor.setCursor(cursor.line - 1)
      },
    })

    this.addCommand({
      id: 'convert-selected-to-latex',
      name: 'Convert exact selection into LaTeX',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        const cursorStart = editor.getCursor('from')
        const cursorEnd = editor.getCursor('to')
        const amCode = editor.getSelection()
        editor.replaceRange(this.AM.toTex(amCode), cursorStart, cursorEnd)
      },
    })

    this.addCommand({
      id: 'convert-am-block-into-mathjax-in-current-file',
      name: 'Convert AsciiMath to LaTeX (active file)',
      callback: this.actionConvertActiveFile(
        ConvertTarget.Tex,
        'This will replace all AsciiMath blocks with LaTeX math blocks in the active file. THIS ACTION CANNOT BE UNDONE.',
      ),
    })

    this.addCommand({
      id: 'convert-am-inline-into-new-syntax-in-current-file',
      name: 'Update old AsciiMath (active file)',
      callback: this.actionConvertActiveFile(
        ConvertTarget.Asciimath,
        dedent`
        This will replace all Asciimath formulas of old syntax (like \`\$ and \$\`) with new syntax (wrapped with dollar signs),
        which is more convenient to use.
        THIS ACTION CANNOT BE UNDONE.`,
      ),
    })

    this.addCommand({
      id: 'convert-am-block-into-mathjax-in-vault',
      name: 'Convert AsciiMath to LaTeX (entire vault)',
      callback: this.actionConvertEntireVault(
        ConvertTarget.Tex,
        'This will replace all AsciiMath formulas with LaTeX math blocks in the entire vault. THIS ACTION CANNOT BE UNDONE.',
      ),
    })

    this.addCommand({
      id: 'convert-am-inline-into-new-syntax-in-vault',
      name: 'Update old AsciiMath (entire vault)',
      callback: this.actionConvertEntireVault(
        ConvertTarget.Asciimath,
        dedent`
        This will replace all Asciimath formulas of old syntax (like \`\$ and \$\`) with new syntax (wrapped with dollar signs),
        which is more convenient to use.
        THIS ACTION CANNOT BE UNDONE.`,
      ),
    })

    // TODO: Should be removed in favor of default math blocks
    this.postProcessors = new Map()
    // register code block processors
    this.app.workspace.onLayoutReady(async () => {
      this.settings.blockPrefix.forEach((prefix) => {
        // console.log(prefix)
        this.registerAsciiMathCodeBlock(prefix)
        this.existPrefixes.push(prefix)
      })
    })
    // register processor in live preview mode
    this.registerEditorExtension([inlinePlugin(this)])
    // register processor in reading mode
    this.registerMarkdownPostProcessor(this.postProcessorInline.bind(this))

    // This will setup integration with obsidian dollar-sign math blocks so plugin can render them
    this.setupMathBlockRendering()

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AsciiMathSettingTab(this.app, this))

    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath loaded')
  }

  modalCallback() {
    return (editor: Editor) => {
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
  }

  // Receive the parameter and judge whether to convert to LaTeX (target: Tex) or remain as AsciiMath (target: Asciimath)
  actionConvertActiveFile(target: ConvertTarget, message: string) {
    return async () =>
      new ConfirmModal(this.app)
        .setMessage(message)
        .onConfirm(async () => {
          const file = this.app.workspace.getActiveFile()
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const { block, inline } = await this.convertAsciiMathInFile(
            file!,
            target,
          )
          new Notice(`Converted ${block} blocks and ${inline} inline formulas.`)
        })
        .open()
  }

  // Receive the parameter and judge whether to convert to LaTeX (target: Tex) or remain as AsciiMath (target: Asciimath)
  actionConvertEntireVault(target: ConvertTarget, message: string) {
    return async () =>
      new ConfirmModal(this.app)
        .setMessage(message)
        .onConfirm(async () => {
          // convert all the asciimath formulas in vault
          const allConvertionRes = await Promise.all(
            this.app.vault.getMarkdownFiles().map(async (f) => {
              const convertionRes = await this.convertAsciiMathInFile(f, target)
              return {
                ...convertionRes,
                hasAsciimath: convertionRes.block || convertionRes.inline,
              }
            }),
          )
          // calculate number of blocks and inline ones that converted in files
          const { block, inline, fileNum } = allConvertionRes.reduce(
            (x, y) => {
              return {
                block: x.block + y.block,
                inline: x.inline + y.inline,
                fileNum: x.fileNum + y.hasAsciimath,
              }
            },
            { block: 0, inline: 0, fileNum: 0 },
          )

          new Notice(
            `Converted ${block} blocks and ${inline} inline formulas in ${fileNum} file${
              fileNum > 1 ? 's' : ''
            }.`,
          )
        })
        .open()
  }

  // This function reads raw text from the `file` and then replaces AsciiMath blocks (both display & inline) with
  // default obsidian math blocks with LaTeX in them.
  // TODO: Should be removed in next major release?
  async convertAsciiMathInFile(file: TFile, target: ConvertTarget) {
    const convertionRes = { block: 0, inline: 0 }
    let content = await this.app.vault.read(file)
    const blockReg = new RegExp(
      `((\`|~){3,})(${this.settings.blockPrefix.join('|')})([\\s\\S]*?)\\n\\1`,
      'gm',
    )
    const [open, close] = Object.values(this.settings.inline).map(
      normalizeEscape,
    )
    const inlineReg = new RegExp(`${open}(.*?)${close}`, 'g')

    try {
      const blockIterator = content.matchAll(blockReg)
      let match: IteratorResult<RegExpMatchArray>

      // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
      while (!(match = blockIterator.next()).done) {
        const block = match.value[0]
        const blockContent = match.value[4]
        const innerContent =
          target === ConvertTarget.Tex
            ? toTex(this.AM, blockContent)
            : blockContent.trim()
        // Four dollar signes are needed because '$$' gets replaced with '$' when using JS .replace() method.
        content = content.replace(block, `$$$$\n${innerContent}\n$$$$`)
        convertionRes.block++
      }

      const inlineBlockIterator = content.matchAll(inlineReg)

      // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
      while (!(match = inlineBlockIterator.next()).done) {
        const block = match.value[0]
        const blockContent = match.value[1]
        const innerContent =
          target === ConvertTarget.Tex
            ? toTex(this.AM, blockContent)
            : blockContent
        // innerContent is trimmed because obsidian recognizes inline blocks only when code there's no space around the code.
        // $ code $ -> not a math block
        // $code$ -> math block
        content = content.replace(block, `$$${innerContent.trim()}$$`)
        convertionRes.inline++
      }

      await this.app.vault.modify(file, content)
    } catch (e) {
      new Notice(String(e))
    }
    return convertionRes
  }

  // Process formulas in reading mode
  // TODO: Should be removed in favor of inline math blocks
  async postProcessorInline(
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext,
  ) {
    const nodeList = el.querySelectorAll('code')
    if (!nodeList.length) return
    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList.item(i)
      if (node.className.trim()) continue
      let { open, close } = this.settings.inline
      open = open.slice(1)
      close = close.substring(0, close.length - 1)
      const regex = new RegExp(
        `^${normalizeEscape(open)}(.*?)${normalizeEscape(close)}$`,
      )
      const matches = node.innerText.match(regex)
      if (!matches) continue
      const mathEl = renderMath(matches[1], false)
      finishRenderMath()
      node.replaceWith(mathEl)
    }
  }
}
