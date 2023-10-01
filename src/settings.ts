import type { App } from 'obsidian'
import { Notice, PluginSettingTab, Setting, debounce } from 'obsidian'
import { AsciiMath } from 'asciimath-parser'
import type AsciiMathPlugin from './main'

type RuleType = string[][]

export interface AsciiMathSettings {
  blockPrefix: string[]
  replaceMathBlock: boolean
  disableDeprecationWarning: boolean
  inline: {
    open: string
    close: string
  }
  customSymbols: RuleType
}

export class AsciiMathSettingTab extends PluginSettingTab {
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
            this.plugin.setupMathBlockRendering()
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
          this.plugin.settings.blockPrefix.forEach((prefix: string) => {
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
