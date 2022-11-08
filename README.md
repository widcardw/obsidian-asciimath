# Obsidian Asciimath

**WARNING** This plugin does not support inline formula very well.

## Install

Goto Obsidian plugin market and search for `obsidian-asciimath` and install it.

## Usage

With the default config, you can write math formulas with the syntax of [asciimath](asciimath.org).

#### Code block

~~~text
```am (or asciimath)
sum _(n=1) ^oo 1/n^2 = pi^2/6
```
~~~

will be passed into

![](screenshots/codeblock.png)

You can add other prefix alias to the settings.

For more infomation about asciimath, please refer to [asciimath.org](asciimath.org) and [zmx0142857's note](https://zmx0142857.github.io/note/).

#### Inline asciimath

The inline formula should be wrapped with \`\$ and \$\`, that is, you should input the formula like

```text
The integral `$int _0 ^oo e^-x dx = 1$`.
```

## Development

```sh
git clone git@github.com:widcardw/obsidian-asciimath.git
pnpm i
pnpm run dev
```
