import type { App } from 'obsidian'
import { Modal, Setting } from 'obsidian'

// Confirm modal is used to confirm the action. It'll call onConfirm callback if the action submit button is pressed.
export class ConfirmModal extends Modal {
  message: string
  enableDisplayMode: boolean
  confirmHandler: () => void

  // biome-ignore lint/complexity/noUselessConstructor: <explanation>
  constructor(app: App) {
    super(app)
  }

  setMessage(message: string): ConfirmModal {
    this.message = message
    return this
  }

  setEnableDisplayMode(enableDisplayMode: boolean): ConfirmModal {
    this.enableDisplayMode = enableDisplayMode
    return this
  }

  onConfirm(f: (v: boolean) => void): ConfirmModal {
    this.confirmHandler = () => f(this.enableDisplayMode)
    return this
  }

  onOpen() {
    const { contentEl, titleEl } = this

    titleEl.setText('Are you sure?')

    new Setting(contentEl).setDesc(this.message)
    new Setting(contentEl)
      .setName('Enable display mode for each formula')
      .setDesc('This option will insert \\display{ ... } for each formula.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.enableDisplayMode)
          .onChange((value) => {
            this.enableDisplayMode = value
          }),
      )
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close()
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText('Continue')
          .setCta()
          .onClick(() => {
            this.close()
            this.confirmHandler()
          }),
      )
  }

  onClose() {
    const { contentEl } = this
    contentEl.empty()
  }
}
