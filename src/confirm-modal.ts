import type { App } from 'obsidian'
import { Modal, Setting } from 'obsidian'

// Confirm modal is used to confirm the action. It'll call onConfirm callback if the action submit button is pressed.
export class ConfirmModal extends Modal {
  message: string
  confirmHandler: () => void

  // biome-ignore lint/complexity/noUselessConstructor: <explanation>
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
