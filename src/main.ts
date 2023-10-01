import type {
  App,
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
  PluginSettingTab,
  Setting,
  debounce,
  finishRenderMath,
  loadMathJax,
  renderMath,
} from 'obsidian'

import dedent from 'ts-dedent'
import { AsciiMath, TokenTypes } from 'asciimath-parser'
import { isLatexCode, normalizeEscape } from './utils'
import { inlinePlugin } from './inline'

interface AsciiMathSettings {
  blockPrefix: string[]
  replaceMathBlock: boolean
  disableDeprecationWarning: boolean
  inline: {
    open: string
    close: string
  }
  customSymbols: RuleType
}

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
  return tex.replace(/(\{|\})(\1+)/g, (...args) => Array(args[2].length + 1).fill(args[1]).join(' '))
}

type RuleType = string[][]

export default class AsciiMathPlugin extends Plugin {
  settings: AsciiMathSettings
  existPrefixes: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tex2chtml: (source: string, r: { display: boolean }) => any

  postProcessors: Map<string, MarkdownPostProcessor> = new Map()

  AM: AsciiMath

  calcSymbols() {
    return this.settings.customSymbols.map(([k, v]) => {
      return [k, { type: TokenTypes.Const, tex: v }] as [string, { type: TokenTypes; tex: string }]
    })
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

    this.tex2chtml = MathJax.tex2chtml
    this.setupMathBlock()

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

    // Deprecation warning for the inline math syntax
    this.app.workspace.on('file-open', async (file) => {
      if (!file || this.settings.disableDeprecationWarning)
        return

      const content = await this.app.vault.read(file)
      const [open, close] = Object.values(this.settings.inline).map(normalizeEscape)
      const inlineReg = new RegExp(`${open}(.*?)${close}`, 'g')
      if (inlineReg.test(content)) {
        new Notice(dedent`
          Obsidian AsciiMath:
          
          Inline math with single backticks is deprecated. Refer to the plugin description to fix this issue.
          You also can disable this warning in the plugin settings.
          
          Click here to dismiss this message.
        `, 0)
      }
    })

    // register processor in live preview mode
    this.registerEditorExtension([inlinePlugin(this)])

    // register processor in reading mode
    this.registerMarkdownPostProcessor(this.postProcessorInline.bind(this))

    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: 'insert-asciimath-block',
      name: 'Insert asciimath block',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        editor.replaceSelection(`\`\`\`${this.settings.blockPrefix[0] || 'asciimath'}\n${editor.getDoc().getSelection()}\n\`\`\``)
        const cursor = editor.getCursor()
        editor.setCursor(cursor.line - 1)
      },
    })

    this.addCommand({
      id: 'insert-asciimath-inline',
      name: 'Insert asciimath inline (deprecated)',
      callback: () => {
        const modal = new Modal(this.app)
        modal.titleEl.setText('This command is deprecated')

        new Setting(modal.contentEl).setName('It is advised to convert your old AsciiMath blocks to new syntax using "Convert math blocks to new syntax" commands and proceed using default obsidian dollar-sign blocks with AsciiMath syntax')

        modal.open()
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
      name: 'Convert math blocks to new syntax (active file)',
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
      name: 'Convert math blocks to new syntax (entire vault)',
      callback: this.actionConvertEntireVault(
        ConvertTarget.Asciimath,
        dedent`
        This will replace all Asciimath formulas of old syntax (like \`\$ and \$\`) with new syntax (wrapped with dollar signs),
        which is more convenient to use.
        THIS ACTION CANNOT BE UNDONE.`,
      ),
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AsciiMathSettingTab(this.app, this))

    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath loaded')
  }

  // Receive the parameter and judge whether to convert to LaTeX (target: Tex) or remain as AsciiMath (target: Asciimath)
  actionConvertActiveFile(target: ConvertTarget, message: string) {
    return async () => new ConfirmModal(this.app)
      .setMessage(message)
      .onConfirm(async () => {
        const file = this.app.workspace.getActiveFile()
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const { block, inline } = await this.convertAsciiMathInFile(file!, target)
        new Notice(`Converted ${block} blocks and ${inline} inline formulas.`)
      })
      .open()
  }

  // Receive the parameter and judge whether to convert to LaTeX (target: Tex) or remain as AsciiMath (target: Asciimath)
  actionConvertEntireVault(target: ConvertTarget, message: string) {
    return async () => new ConfirmModal(this.app)
      .setMessage(message)
      .onConfirm(async () => {
        // convert all the asciimath formulas in vault
        const allConvertionRes = await Promise.all(this.app.vault.getMarkdownFiles().map(async (f) => {
          const convertionRes = await this.convertAsciiMathInFile(f, target)
          return { ...convertionRes, hasAsciimath: convertionRes.block || convertionRes.inline }
        }))
        // calculate number of blocks and inline ones that converted in files
        const { block, inline, fileNum } = allConvertionRes.reduce((x, y) => {
          return { block: x.block + y.block, inline: x.inline + y.inline, fileNum: x.fileNum + y.hasAsciimath }
        }, { block: 0, inline: 0, fileNum: 0 })

        new Notice(`Converted ${block} blocks and ${inline} inline formulas in ${fileNum} file${fileNum > 1 ? 's' : ''}.`)
      })
      .open()
  }

  // This will hijack function that is used for by obsidian for rendering math.
  setupMathBlock() {
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

  // This function reads raw text from the `file` and then replaces AsciiMath blocks (both display & inline) with
  // default obsidian math blocks with LaTeX in them.
  // TODO: Should be removed in next major release?
  async convertAsciiMathInFile(file: TFile, target: ConvertTarget) {
    const convertionRes = { block: 0, inline: 0 }
    let content = await this.app.vault.read(file)
    const blockReg = new RegExp(`((\`|~){3,})(${this.settings.blockPrefix.join('|')})([\\s\\S]*?)\\n\\1`, 'gm')
    const [open, close] = Object.values(this.settings.inline).map(normalizeEscape)
    const inlineReg = new RegExp(`${open}(.*?)${close}`, 'g')

    try {
      const blockIterator = content.matchAll(blockReg)
      let match: IteratorResult<RegExpMatchArray>
      // eslint-disable-next-line no-cond-assign
      while (!(match = blockIterator.next()).done) {
        const block = match.value[0]
        const blockContent = match.value[4]
        const innerContent = target === ConvertTarget.Tex ? toTex(this.AM, blockContent) : blockContent.trim()
        // Four dollar signes are needed because '$$' gets replaced with '$' when using JS .replace() method.
        content = content.replace(block, `$$$$\n${innerContent}\n$$$$`)
        convertionRes.block++
      }

      const inlineBlockIterator = content.matchAll(inlineReg)
      // eslint-disable-next-line no-cond-assign
      while (!(match = inlineBlockIterator.next()).done) {
        const block = match.value[0]
        const blockContent = match.value[1]
        const innerContent = target === ConvertTarget.Tex ? toTex(this.AM, blockContent) : blockContent
        // innerContent is trimmed because obsidian recognizes inline blocks only when code there's no space around the code.
        // $ code $ -> not a math block
        // $code$ -> math block
        content = content.replace(block, `$$${innerContent.trim()}$$`)
        convertionRes.inline++
      }

      await this.app.vault.modify(file, content)
    }
    catch (e) {
      new Notice(String(e))
    }
    return convertionRes
  }

  registerAsciiMathCodeBlock(prefix: string) {
    this.postProcessors.set(
      prefix,
      this.registerMarkdownCodeBlockProcessor(
        prefix,
        (src, el, ctx) => this.postProcessor(prefix, src, el, ctx),
      ),
    )
  }

  // Process formulas in reading mode
  // TODO: Should be removed in favor of inline math blocks
  async postProcessorInline(el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const nodeList = el.querySelectorAll('code')
    if (!nodeList.length)
      return
    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList.item(i)
      if (node.className.trim())
        continue
      let { open, close } = this.settings.inline
      open = open.slice(1)
      close = close.substring(0, close.length - 1)
      const regex = new RegExp(`^${normalizeEscape(open)}(.*?)${normalizeEscape(close)}$`)
      const matches = node.innerText.match(regex)
      if (!matches)
        continue
      const mathEl = renderMath(matches[1], false)
      finishRenderMath()
      node.replaceWith(mathEl)
    }
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
}

function validateSettings(settings: AsciiMathSettings): { isValid: boolean; message: string } {
  if (settings.blockPrefix.length < 1) {
    return {
      isValid: false,
      message: 'You should add at least 1 block prefix!',
    }
  }
  const { open, close } = settings.inline
  if (!open.startsWith('`') || open.length <= 1 || open.startsWith('``')) {
    return {
      isValid: false,
      message: 'Invalid inline leading escape!',
    }
  }
  if (!close.endsWith('`') || close.length <= 1 || close.endsWith('``')) {
    return {
      isValid: false,
      message: 'Invalid inline trailing escape!',
    }
  }
  const { customSymbols } = settings
  if (customSymbols.find(pair => pair.length !== 2)) {
    return {
      isValid: false,
      message: 'Custom rule should be two string split with a comma!',
    }
  }

  return {
    isValid: true,
    message: 'OK',
  }
}

// Confirm modal is used to confirm the action. It'll call onConfirm callback if the action submit button is pressed.
class ConfirmModal extends Modal {
  message: string
  confirmHandler: () => void

  constructor(app: App) {
    super(app)
  }

  setMessage(message: string): ConfirmModal {
    this.message = message
    return this
  }

  onConfirm(f: () => void): ConfirmModal {
    this.confirmHandler = f
    return this
  }

  onOpen() {
    const { contentEl, titleEl } = this

    titleEl.setText('Are you sure?')

    new Setting(contentEl).setDesc(this.message)
    new Setting(contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Cancel')
          .onClick(() => {
            this.close()
          }))
      .addButton(btn =>
        btn
          .setButtonText('Continue')
          .setCta()
          .onClick(() => {
            this.close()
            this.confirmHandler()
          }))
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}

class AsciiMathSettingTab extends PluginSettingTab {
  plugin: AsciiMathPlugin

  constructor(app: App, plugin: AsciiMathPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    containerEl.createEl('h2', { text: 'Settings for asciimath' })

    new Setting(containerEl)
      .setName('Code block prefix aliases')
      .setDesc('Seperate different aliases with comma.')
      .addText(text => text
        .setPlaceholder('asciimath, am')
        .setValue(this.plugin.settings.blockPrefix.join(', '))
        .onChange(debounce((value) => {
          this.plugin.settings.blockPrefix = value.split(',')
            .map(s => s.trim())
            .filter(Boolean)
        }, 1000)))

    new Setting(containerEl)
      .setName('Replace math blocks')
      .setDesc('Enable this if you want to use AsciiMath but keep using default math blocks (dollar-sign blocks). This will not affect your previous notes that are written in LaTeX because the plugin will check which syntax to use before drawing the math.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.replaceMathBlock)
          .onChange((v) => {
            this.plugin.settings.replaceMathBlock = v
            this.plugin.setupMathBlock()
          })
      })

    new Setting(containerEl)
      .setName('Custom symbols')
      .setDesc('Transforms custom symbols into LaTeX symbols. One row for each rule.')
      .addTextArea((text) => {
        const el = text
          .setPlaceholder('symbol1, \\LaTeXSymbol1\nsymbol2, \\LaTeXSymbol2\n...')
          .setValue(this.plugin.settings.customSymbols.map(r => r.join(', ')).join('\n'))
          .onChange(debounce((value) => {
            this.plugin.settings.customSymbols = value.split('\n').map(r => r.split(',').map(s => s.trim()).filter(Boolean)).filter(l => l.length)
          }, 1000))
        el.inputEl.addClass('__asciimath_settings_custom-symbols')
      })

    new Setting(containerEl)
      .setHeading()
      .setName('Inline code math (deprecated)')
      .setDesc('These settings will be removed in the next version of the plugin')

    new Setting(containerEl)
      .setName('Disable deprecation warning')
      .setDesc('Note: ignoring deprecation issues may make the plugin unusable with existing notes in the future.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.disableDeprecationWarning)
          .onChange((v) => {
            this.plugin.settings.disableDeprecationWarning = v
          })
      })

    new Setting(containerEl)
      .setName('Inline asciimath start')
      .setDesc('The leading escape of the inline asciimath formula. It should starts with **only one backtick**.')
      .addText(text => text
        .setPlaceholder('`$')
        .setValue(this.plugin.settings.inline.open)
        .onChange(debounce ((value) => {
          this.plugin.settings.inline.open = value
        }, 1000)))

    new Setting(containerEl)
      .setName('Inline asciimath end')
      .setDesc('The trailing escape of the inline asciimath formula. It should ends with **only one backtick**.')
      .addText(text => text
        .setPlaceholder('$`')
        .setValue(this.plugin.settings.inline.close)
        .onChange(debounce((value) => {
          this.plugin.settings.inline.close = value
        }, 1000)))

    new Setting(containerEl)
      .setName('Don\'t forget to save and reload settings →')
      .addButton(btn => btn
        .setButtonText('Save')
        .onClick(async () => {
          const valid = validateSettings(this.plugin.settings)
          if (!valid.isValid) {
            new Notice(valid.message)
            return
          }
          await this.plugin.saveSettings()
          await this.plugin.loadSettings()
          this.plugin.settings.blockPrefix.forEach((prefix) => {
            if (!this.plugin.existPrefixes.includes(prefix))
              this.plugin.registerAsciiMathCodeBlock(prefix)
          })
          this.plugin.AM = new AsciiMath({
            symbols: this.plugin.calcSymbols(),
          })
          new Notice('Asciimath settings reloaded successfully!')
        }))
  }
}
