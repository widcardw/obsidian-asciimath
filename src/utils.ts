function normalizeEscape(escape: string) {
  return escape.replace(/([$^\\.()[\]{}*?|])/g, '\\$1')
}

export {
  normalizeEscape,
}
