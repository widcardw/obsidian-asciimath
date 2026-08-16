interface IMathJax {
  tex2chtml: (source: string, r: { display: boolean }) => HTMLElement
}
declare const MathJax: IMathJax
