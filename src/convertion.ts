import { EditorChange, MarkdownView, Notice, Plugin, Pos, TFile } from "obsidian";
import { FormulaMatch, isLatexCode } from "./utils";
import type AsciiMathPlugin from "./main";
import { toTex } from "./utils";
import { ConfirmModal } from "./confirm-modal";

async function convertAsciiMathInFile(plugin: AsciiMathPlugin, file: TFile, display: boolean) {
  // get the editor instance
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return { block: 0, inline: 0 };

  const { editor } = view;

  // get the parsed block structure of Obsidian
  const cache = plugin.app.metadataCache.getFileCache(file);
  if (!cache || !cache.sections) return { block: 0, inline: 0 };

  // get all the math blocks and inline math formulas
  const formulaBlocks: Array<{ content: string, position: Pos, isBlock: boolean }> = [];

  if (cache.sections) {
    for (const section of cache.sections) {
      const { start, end } = section.position
      if (section.type === 'math' || section.type === 'code') {
        let content = editor.getRange({ line: start.line, ch: start.col }, { line: end.line, ch: end.col })
        if (section.type === 'math') {
          content = content.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '')
        }
        if (section.type === 'code') {
          const blockReg = new RegExp(
            `((\`|~){3,})(${plugin.settings.blockPrefix.join('|')})([\\s\\S]*?)\\n\\1`,
            'm',
          )
          const match = content.match(blockReg)
          if (match) content = match[4].trim()
          else continue
        }

        formulaBlocks.push({
          content,
          position: section.position,
          isBlock: true,
        })
      } else {
        let content = editor.getRange({ line: start.line, ch: start.col }, { line: end.line, ch: end.col })
        const inlineMathRegex = /(?<!\$)\$([^$]+?)\$(?!\$)/g;
        let inlineMatch;
        while ((inlineMatch = inlineMathRegex.exec(content)) !== null) {
          const relativeStart = inlineMatch.index;
          const relativeEnd = relativeStart + inlineMatch[0].length;
          const absoluteStart = section.position.start.offset + relativeStart;
          const absoluteEnd = section.position.start.offset + relativeEnd;

          const startPos = editor.offsetToPos(absoluteStart)
          const endPos = editor.offsetToPos(absoluteEnd)

          const amCode = inlineMatch[1].trim()
          if (isLatexCode(amCode)) continue
          formulaBlocks.push({
            position: {
              start: { line: startPos.line, col: startPos.ch, offset: absoluteStart },
              end: { line: endPos.line, col: endPos.ch, offset: absoluteEnd },
            },
            content: amCode,
            isBlock: false
          });
        }
      }
    }

    const changes: EditorChange[] = []
    formulaBlocks.forEach(block => {
      const { start, end } = block.position
      const res = toTex(plugin.AM, block.content, display)

      const replacement = block.isBlock
        ? `$$\n${res}\n$$`
        : `$${res}$`

      changes.push({
        from: { line: start.line, ch: start.col },
        to: { line: end.line, ch: end.col },
        text: replacement,
      })
    })
    editor.transaction({ changes })
    new Notice(`Conversion completed: ${formulaBlocks.length} formulas processed`)
  }
  return {
    block: formulaBlocks.filter(x => x.isBlock).length,
    inline: formulaBlocks.filter(x => !x.isBlock).length,
  }
}

async function extractFormulasInFile(plugin: AsciiMathPlugin, file: TFile) {
  const content = await plugin.app.vault.read(file);
  const formulas: FormulaMatch[] = [];
  const codeRanges: { start: number; end: number; isAm: boolean }[] = [];
  const codeBlockRegex = /(^|\n)(```|~~~)[\s\S]*?\2/g;
  const amCodeBlockRegex = new RegExp(
    `([\`~]{3,})(${plugin.settings.blockPrefix.join('|')})([\\s\\S]*?)\\n\\1`, 'm'
  )
  const inlineCodeRegex = /`[^`\n]*`/g;

  // extract code blocks
  for (const match of content.matchAll(codeBlockRegex)) {
    const am = match[0].match(amCodeBlockRegex)
    codeRanges.push({
      start: match.index!,
      end: match.index! + match[0].length,
      isAm: am !== null,
    });
    if (am) {
      const amCode = am[3]
      let start = match.index!
      if (match[1] === '\n') {
        start += 1
      }
      formulas.push({
        type: 'block',
        start,
        end: match.index! + match[0].length,
        content: amCode,
      })
    }
  }

  // record inline code positions
  for (const match of content.matchAll(inlineCodeRegex)) {
    codeRanges.push({
      start: match.index!,
      end: match.index! + match[0].length,
      isAm: false,
    });
  }

  // 2. extract all formulas (ignore code blocks)
  // extract single $
  const inlineRegex = /(?<![\\\$])\$([^$]+?)\$/g;
  const blockRegex = /(?<!\\)\$\$([\s\S]+?)\$\$/g;

  // extract inline formulas
  for (const match of content.matchAll(inlineRegex)) {
    if (!isLatexCode(match[1])) {
      formulas.push({
        type: "inline",
        start: match.index!,
        end: match.index! + match[0].length,
        content: match[1].trim()
      });
    }
  }

  // extract block formulas
  for (const match of content.matchAll(blockRegex)) {
    if (!isLatexCode(match[1])) {
      formulas.push({
        type: "block",
        start: match.index!,
        end: match.index! + match[0].length,
        content: match[1].trim()
      });
    }
  }

  // 3. filter out formulas in code blocks
  return formulas.filter(formula => {
    return !codeRanges.some(range =>
      formula.start >= range.start
      && formula.end <= range.end
      && !range.isAm
    );
  });
}

async function replaceFormulasInFile(plugin: AsciiMathPlugin, file: TFile, enableDisplayMode: boolean) {
  const content = await plugin.app.vault.read(file);
  const formulas = await extractFormulasInFile(plugin, file);

  console.log({ formulas })

  // sort formulas by start position in reverse order (to avoid index error)
  formulas.sort((a, b) => b.start - a.start);

  let newContent = content;

  const convertedCnt = { block: 0, inline: 0 }

  for (const formula of formulas) {
    if (isLatexCode(formula.content)) {
      continue
    }
    const converted = toTex(plugin.AM, formula.content.trim(), enableDisplayMode);
    const replacement = formula.type === "inline"
      ? `$${converted}$`
      : `$$${converted}$$`;

    newContent =
      newContent.substring(0, formula.start) +
      replacement +
      newContent.substring(formula.end);

    convertedCnt[formula.type] += 1
  }

  await plugin.app.vault.modify(file, newContent);
  return convertedCnt
}

function actionConvertActiveFile(plugin: AsciiMathPlugin, message: string) {
  return async () =>
    new ConfirmModal(plugin.app)
      .setMessage(message)
      .setEnableDisplayMode(false)
      .onConfirm(async (displayMode) => {
        const file = plugin.app.workspace.getActiveFile()
        if (!file) {
          new Notice('No active file found.')
          return
        }
        await convertAsciiMathInFile(plugin, file, displayMode)
      })
      .open()
}

function actionConvertEntireVault(plugin: AsciiMathPlugin, message: string) {
  return async () =>
      new ConfirmModal(plugin.app)
        .setMessage(message)
        .setEnableDisplayMode(false)
        .onConfirm(async (displayMode) => {
          // convert all the asciimath formulas in vault
          const allConvertionRes = await Promise.all(
            plugin.app.vault.getMarkdownFiles().map(async (f) => {
              const convertionRes = await replaceFormulasInFile(plugin, f, displayMode)
              return {
                ...convertionRes,
                hasAsciimath: convertionRes.block || convertionRes.inline,
              }
            }),
          )
          // calculate number of blocks and inline ones that converted in files
          const lo = { block: 0, inline: 0, fileNum: 0 }
          allConvertionRes.forEach((res) => {
            if (res.hasAsciimath) {
              lo.block += res.block
              lo.inline += res.inline
              lo.fileNum += 1
            }
          })

          new Notice(
            `Converted ${lo.block} blocks and ${lo.inline} inline formulas in ${lo.fileNum} file${lo.fileNum > 1 ? 's' : ''
            }.`,
          )
        })
        .open()
}

export {
  convertAsciiMathInFile,
  extractFormulasInFile,
  replaceFormulasInFile,
  actionConvertActiveFile,
  actionConvertEntireVault,
}