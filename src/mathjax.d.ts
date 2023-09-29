interface IMathJax {
   tex2chtml: (source: string, r: { display: boolean }) => any 
}
declare const MathJax: IMathJax