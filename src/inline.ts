/**
 * @deprecated The inline code plugin is no longer supported
 */

import { syntaxTree } from '@codemirror/language'
import type { EditorSelection, Range } from '@codemirror/state'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { editorLivePreviewField, finishRenderMath, renderMath } from 'obsidian'

import { AsciiMath } from 'asciimath-parser'
import { normalizeEscape } from 'src/utils'
import type AsciiMathPlugin from './main'
const AM = new AsciiMath()

function selectionAndRangeOverlap(
  selection: EditorSelection,
  rangeFrom: number,
  rangeTo: number,
) {
  for (const range of selection.ranges) {
    if (range.from <= rangeTo && range.to >= rangeFrom) return true
  }

  return false
}

function inlineRender(view: EditorView, plugin: AsciiMathPlugin) {
  const currentFile = plugin.app.workspace.getActiveFile()
  if (!currentFile) return

  const widgets: Range<Decoration>[] = []
  const selection = view.state.selection
  const regex = /.*?_?inline-code_?.*/
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node.type
        // markdown formatting symbols
        if (type.name.includes('formatting')) return
        if (!regex.test(type.name)) return

        // contains the position of node
        const start: number = node.from
        const end: number = node.to
        // don't continue if current cursor position and inline code node (including formatting
        // symbols) overlap
        const { open, close } = plugin.settings.inline
        if (
          selectionAndRangeOverlap(
            selection,
            start - open.length + 1,
            end + close.length - 1,
          )
        )
          return

        // const original = view.state.doc.sliceString(start, end).trim()
        const original = view.state.doc
          .sliceString(start - open.length + 1, end + close.length - 1)
          .trim()

        const regex2 = new RegExp(
          `^${normalizeEscape(open)}(.*?)${normalizeEscape(close)}$`,
        )
        const matches = original.match(regex2)
        if (!matches) return

        widgets.push(
          Decoration.replace({
            widget: new InlineWidget(matches[1], view),
            inclusive: false,
            block: false,
          }).range(start - 1, end + 1),
        )
      },
    })
  }
  return Decoration.set(widgets, true)
}
class InlineWidget extends WidgetType {
  constructor(
    readonly rawQuery: string,
    private view: EditorView,
  ) {
    super()
  }

  // Widgets only get updated when the raw query changes/the element gets focus and loses it
  // to prevent redraws when the editor updates.
  eq(other: InlineWidget): boolean {
    if (other.rawQuery === this.rawQuery) return true

    return false
  }

  // Add CSS classes and return HTML element.
  // In "complex" cases it will get filled with the correct text/child elements later.
  toDOM(_view: EditorView): HTMLElement {
    const tex = AM.toTex(this.rawQuery)
    const mathEl = renderMath(tex, false)
    finishRenderMath()
    return mathEl
  }
}
function inlinePlugin(plugin: AsciiMathPlugin) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = inlineRender(view, plugin) ?? Decoration.none
      }

      update(update: ViewUpdate) {
        // only activate in LP and not source mode
        if (!update.state.field(editorLivePreviewField)) {
          this.decorations = Decoration.none
          return
        }
        if (update.docChanged || update.viewportChanged || update.selectionSet)
          this.decorations =
            inlineRender(update.view, plugin) ?? Decoration.none
      }
    },
    { decorations: (v) => v.decorations },
  )
}

export { inlinePlugin }
