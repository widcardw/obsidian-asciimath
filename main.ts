import type {
  App,
  Editor,
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

// @ts-expect-error type declaration
import AM from 'asciimath-js'
import { inlinePlugin } from 'inline'

// Remember to rename these classes and interfaces!

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

export default class AsciiMathPlugin extends Plugin {
  settings: AsciiMathSettings

  postProcessors: Map<string, MarkdownPostProcessor> = new Map()

  async onload() {
    await this.loadSettings()

    await loadMathJax()

    AM.init()

    // @ts-expect-error MathJax name not found
    if (!MathJax) {
      console.warn('MathJax was not defined despite loading it.')
      return
    }

    this.postProcessors = new Map()

    // register code block processors
    this.app.workspace.onLayoutReady(async () => {
      this.settings.blockPrefix.forEach((prefix) => {
        // console.log(prefix)
        this.registerAsciiMathBlock(prefix)
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
      editorCallback: (editor: Editor, view: MarkdownView) => {
        // // eslint-disable-next-line no-console
        // console.log(editor.getSelection(), editor.getCursor())
        editor.replaceSelection(`\`\`\`${this.settings.blockPrefix[0] || 'asciimath'}\n${editor.getDoc().getSelection()}\n\`\`\``)
        const cursor = editor.getCursor()
        editor.setCursor(cursor.line - 1)
      },
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AsciiMathSettingTab(this.app, this))

    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath loaded')
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
  async postProcessorInline(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
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
      const regex = new RegExp(`^${open.replace(/([$^\\.()[\]{}*?|])/, '\\$1')}(.*?)${close.replace(/([$^\\.()[\]{}*?|])/, '\\$1')}$`)
      const matches = node.innerText.match(regex)
      if (!matches)
        continue
      const tex = AM.am2tex(matches[1])
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
    const tex = AM.am2tex(src)

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
          // // eslint-disable-next-line no-console
          // console.log(value)
          this.plugin.settings.blockPrefix = value.split(',')
            .filter(Boolean)
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
          // // eslint-disable-next-line no-console
          // console.log(value)
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
            // eslint-disable-next-line no-new
            new Notice(valid.message)
            return
          }
          await this.plugin.saveSettings()
          await this.plugin.loadSettings()
          // eslint-disable-next-line no-new
          new Notice('Asciimath settings reloaded successfully!')
        }))
  }
}
