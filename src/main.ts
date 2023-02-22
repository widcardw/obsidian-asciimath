import type {
  App,
  Editor,
  EditorChange,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownView,
} from 'obsidian'
import {
  MarkdownPreviewRenderer,

  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  finishRenderMath,
  loadMathJax,
  renderMath,
} from 'obsidian'

import { AsciiMath } from 'asciimath-parser'
import { normalizeEscape } from './utils'
import { inlinePlugin } from './inline'

interface AsciiMathSettings {
  blockPrefix: string[]
  inline: {
    open: string
    close: string
  }
}

const DEFAULT_SETTINGS: AsciiMathSettings = {
  blockPrefix: ['asciimath', 'am'],
  inline: {
    open: '`$',
    close: '$`',
  },
}

function toTex(am: AsciiMath, content: string): string {
  const tex = am.toTex(content)
  return tex.replace(/(\{|\})(\1+)/g, (...args) => Array(args[2].length + 1).fill(args[1]).join(' '))
}

export default class AsciiMathPlugin extends Plugin {
  settings: AsciiMathSettings
  existPrefixes: string[] = []

  postProcessors: Map<string, MarkdownPostProcessor> = new Map()

  AM: AsciiMath

  async onload() {
    await this.loadSettings()

    await loadMathJax()

    // AM.init()
    this.AM = new AsciiMath()

    // @ts-expect-error MathJax name not found
    if (!MathJax) {
      console.warn('MathJax was not defined despite loading it.')
      new Notice('Error: MathJax was not defined despite loading it!')
      return
    }

    this.postProcessors = new Map()

    // register code block processors
    this.app.workspace.onLayoutReady(async () => {
      this.settings.blockPrefix.forEach((prefix) => {
        // console.log(prefix)
        this.registerAsciiMathBlock(prefix)
        this.existPrefixes.push(prefix)
      })
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
      id: 'convert-am-block-into-mathjax-in-current-file',
      name: 'Convert asciimath block into mathjax in current file',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        this.editorTransactionConvertFormula(editor)
      },
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AsciiMathSettingTab(this.app, this))

    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath loaded')
  }

  editorTransactionConvertFormula(editor: Editor) {
    const content = editor.getValue()
    const blockReg = new RegExp(`((\`|~){3,})(${this.settings.blockPrefix.join('|')})([\\s\\S]*?)\\n\\1`, 'gm')
    const [open, close] = Object.values(this.settings.inline).map(normalizeEscape)
    const inlineReg = new RegExp(`${open}(.*?)${close}`, 'g')
    const changes: EditorChange[] = []

    try {
      const blockIterator = content.matchAll(blockReg)
      let match: IteratorResult<RegExpMatchArray>
      // eslint-disable-next-line no-cond-assign
      while (!(match = blockIterator.next()).done) {
        const index = match.value.index
        if (typeof index === 'undefined')
          throw new Error('Invalid index: while converting block fomula')
        const amContent = match.value[4]
        if (typeof amContent !== 'string')
          throw new Error(`Invalid asciimath formula, index: ${index}`)
        const from = editor.offsetToPos(index)
        const to = editor.offsetToPos(index + match.value[0].length)
        changes.push({
          text: `$$\n${toTex(this.AM, amContent)}\n$$`,
          from,
          to,
        })
      }

      const inlineIterator = content.matchAll(inlineReg)
      // eslint-disable-next-line no-cond-assign
      while (!(match = inlineIterator.next()).done) {
        const index = match.value.index
        if (typeof index === 'undefined')
          throw new Error('Invalid index: while converting inline formula')
        const amContent = match.value[1]
        if (typeof amContent !== 'string')
          throw new Error(`Invalid asciimath formula, index: ${index}`)
        const from = editor.offsetToPos(index)
        const to = editor.offsetToPos(index + match.value[0].length)
        changes.push({
          text: `$${toTex(this.AM, amContent)}$`,
          from,
          to,
        })
      }
      if (changes.length === 0) {
        new Notice('No asciimath formulas converted!')
        return
      }
      // Batch transaction
      editor.transaction({ changes })
      new Notice(`Successfully converted ${changes.length} asciimath formulas!`)
    }
    catch (e) {
      new Notice(String(e))
    }
  }

  registerAsciiMathBlock(prefix: string) {
    this.postProcessors.set(
      prefix,
      this.registerMarkdownCodeBlockProcessor(
        prefix,
        (src, el, ctx) => this.postProcessor(prefix, src, el, ctx),
      ),
    )
  }

  // Process formulas in reading mode
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
      const tex = this.AM.toTex(matches[1])
      const mathEl = renderMath(tex, false)
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
    const tex = this.AM.toTex(src)

    const mathEl = renderMath(tex, true)

    el.appendChild(mathEl)

    finishRenderMath()
  }

  onunload() {
    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath unloaded')
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
  return {
    isValid: true,
    message: 'OK',
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
        .onChange(async (value) => {
          this.plugin.settings.blockPrefix = value.split(',')
            .map(s => s.trim())
            .filter(Boolean)
          // await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Inline asciimath start')
      .setDesc('The leading escape of the inline asciimath formula. It should starts with **only one backtick**.')
      .addText(text => text
        .setPlaceholder('`$')
        .setValue(this.plugin.settings.inline.open)
        .onChange(async (value) => {
          this.plugin.settings.inline.open = value
          // await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Inline asciimath end')
      .setDesc('The trailing escape of the inline asciimath formula. It should ends with **only one backtick**.')
      .addText(text => text
        .setPlaceholder('$`')
        .setValue(this.plugin.settings.inline.close)
        .onChange(async (value) => {
          // // eslint-disable-next-line no-console
          // console.log(value)
          this.plugin.settings.inline.close = value
          // await this.plugin.saveSettings()
        }))

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
              this.plugin.registerAsciiMathBlock(prefix)
          })
          new Notice('Asciimath settings reloaded successfully!')
        }))
  }
}
