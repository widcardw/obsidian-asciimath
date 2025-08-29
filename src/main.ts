import type {
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
} from 'obsidian'
import {
  MarkdownPreviewRenderer,
  Notice,
  Plugin,
  finishRenderMath,
  loadMathJax,
  renderMath,
} from 'obsidian'

import { AsciiMath, TokenTypes } from 'asciimath-parser'
import { AsciiMathSettingTab, type AsciiMathSettings } from './settings'
import { isLatexCode } from './utils'
import { createModalInstance } from './symbol-search/modal-instance'
import { initCommands } from './commands'

const DEFAULT_SETTINGS: AsciiMathSettings = {
  blockPrefix: ['asciimath', 'am'],
  disableDeprecationWarning: false,
  replaceMathBlock: true,
  customSymbols: [],
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

    initCommands(this)

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
    // this.registerEditorExtension([inlinePlugin(this)])
    // register processor in reading mode
    // this.registerMarkdownPostProcessor(this.postProcessorInline.bind(this))

    // This will setup integration with obsidian dollar-sign math blocks so plugin can render them
    this.setupMathBlockRendering()

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AsciiMathSettingTab(this.app, this))

    // eslint-disable-next-line no-console
    console.log('Obsidian asciimath loaded')
  }
}
