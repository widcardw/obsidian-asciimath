# Obsidian Asciimath

## Install

- (Recommended) Goto Obsidian plugin market, search for `obsidian-asciimath` and install it.
- (Manually) Goto the [release page](https://github.com/widcardw/obsidian-asciimath/releases), download the zip, unzip it and add it to your plugins folder.

## Usage

You can write math formulas with the syntax of [asciimath](http://asciimath.org).
I've recently refactored the library, and you can refer to [asciimath-parser](https://github.com/widcardw/asciimath-parser) and [its online demo](https://asciimath.widcard.win).

#### Code block

~~~text
```am (or asciimath)
sum _(n=1) ^oo 1/n^2 = pi^2/6
```
~~~

![](screenshots/codeblock.png)

Multiline formula alignment (Specially thanks to [asciimath-js](https://github.com/zmx0142857/asciimathml))

~~~text
```am
f: RR & -> S^1
                         <-- a blank line here
x & |-> "e"^(2pi "i" x)
```
~~~

![](screenshots/multiline.png)

> asciimath is simple and easy to read, while in LaTeX, you should write the long formula with so many backslashes, and sometimes may be confusing...
>
> ```tex
> \begin{aligned}
> f: \mathbb{R} & \to S^{1} \\
> x & \mapsto \mathrm{e}^{2 \pi \mathrm{i} x }
> \end{aligned}
> ```

#### Inline asciimath

By default, the inline formula should be wrapped with \`\$ and \$\`, that is, you should input the formula like

```markdown
The integral `$int _0^(+oo) "e"^(-x) dx = 1$`.
```

![](screenshots/inline.png)

For more infomation about asciimath, please refer to [asciimath.org](http://asciimath.org) and [zmx0142857's note (in Chinese)](https://zmx0142857.github.io/note/).


## Configuration

You can add other prefix alias of code block in the settings. The default values are `asciimath` and `am`.

Inline formula **can only** be wrapped with special escapes. Just look at the examples below.

```diff
- start: ``   !!! invalid !!!
- end:   ``   !!! invalid !!!

- start: `    !!! invalid !!!
- end:   `    !!! invalid !!!

+ start: `$   √√√  valid  √√√  // default
+ end:   $`   √√√  valid  √√√  // default

+ start: `$$  √√√  valid  √√√
+ end:   $$`  √√√  valid  √√√

+ start: `*   √√√  valid  √√√
+ end:   *`   √√√  valid  √√√

+ start: `{   √√√  valid  √√√
+ end:   }`   √√√  valid  √√√

+ start: `[   √√√  valid  √√√
+ end:   ]`   √√√  valid  √√√

(... any other valid escapes ...)
```

After changing the settings, **DON'T FORGET to hit the "Save" button**.

## Commands

- Insert asciimath codeblock
- Convert asciimath into mathjax in current file

![](screenshots/out.gif)

## Development

```sh
git clone git@github.com:widcardw/obsidian-asciimath.git
pnpm i
pnpm run dev
```
