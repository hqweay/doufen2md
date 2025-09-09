# doufen2md

将[豆坟](https://blog.doufen.org/)从豆瓣导出的内容转换为 Markdown，并从 Markdown 生成 EPUB。

## 安装

```bash
npm install
```

需要 Node.js 16+。

## 用法

- 从 xlsx 导出为 Markdown：

```bash
node index.js xlsx-to-md --xlsx 豆伴(38065370).xlsx --sheet 日记 --out 日记
```

- 从 Markdown 生成 EPUB：

```bash
node index.js md-to-epub --md-root 日记 --title 梦开始的地方 --author 黄梦子 --out epub
```

## Markdown 图片

Markdown 中的图片形如：

```md
![](https://img1.doubanio.com/view/note/l/public/p100925520.jpg)
```

生成 EPUB 时，程序会：
- 下载远程图片到 `cache/images/`
- 将 `<img src>` 指向缓存文件的绝对路径
- 打包器会把图片资源收录进 EPUB

## 目录结构

- `xlsx_to_md.js`: xlsx → Markdown 导出逻辑
- `md_to_epub.js`: Markdown → EPUB 生成逻辑
- `cache/images/`: 已下载的图片缓存
- `epub/`: 生成的 EPUB 文件输出目录

## 许可证

MIT