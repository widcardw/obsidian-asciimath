import type {
  App,
  Editor,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownView,
} from 'obsidian'
import {
  Plugin,
  PluginSettingTab,
  Setting,
  loadMathJax,
  renderMath,
} from 'obsidian'

// @ts-expect-error type declaration
import AM from 'asciimath-js'

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
    open: '``',
    close: '``',
  },
}

export default class AsciiMathPlugin extends Plugin {
  settings: AsciiMathSettings

  postProcessors: Map<string, MarkdownPostProcessor> = new Map()

  async onload() {
    await this.loadSettings()

    await loadMathJax()

    // @ts-expect-error MathJax name not found
    if (!MathJax) {
      console.warn('MathJax was not defined despite loading it.')
      return
    }

    this.postProcessors = new Map()

    this.app.workspace.onLayoutReady(async () => {
      this.settings.blockPrefix.forEach((prefix) => {
        // console.log(prefix)
        this.registerType(prefix)
      })
    })

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

  registerType(prefix: string) {
    this.postProcessors.set(
      prefix,
      this.registerMarkdownCodeBlockProcessor(
        prefix,
        (src, el, ctx) => this.postProcessor(prefix, src, el, ctx),
      ),
    )
  }

  postProcessor(
    prefix: string,
    src: string,
    el: HTMLElement,
    _?: MarkdownPostProcessorContext,
  ) {
    const tex = AM.am2tex(src)

    console.log(AM, tex)

    const mathEl = renderMath(tex, true)

    el.appendChild(mathEl)
  }

  onunload() {
    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath unloaded')
    // this.postProcessors = null
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
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
      .setName('Code block prefixes')
      .setDesc('Seperate different alias with comma.')
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.blockPrefix.join(', '))
        .onChange(async (value) => {
          // // eslint-disable-next-line no-console
          // console.log(value)
          this.plugin.settings.blockPrefix = value.split(',').map(s => s.trim()).filter(Boolean)
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Inline asciimath start')
      .setDesc('The leading of the inline asciimath formula.')
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.inline.open)
        .onChange(async (value) => {
          // // eslint-disable-next-line no-console
          // console.log(value)
          this.plugin.settings.inline.open = value
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Inline asciimath end')
      .setDesc('The trailing of the inline asciimath formula.')
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.inline.close)
        .onChange(async (value) => {
          // // eslint-disable-next-line no-console
          // console.log(value)
          this.plugin.settings.inline.close = value
          await this.plugin.saveSettings()
        }))
  }
}
