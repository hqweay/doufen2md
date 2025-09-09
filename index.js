
const { runXlsxToMd } = require('./xlsx_to_md');
const { runMdToEpub } = require('./md_to_epub');

function printHelp() {
    console.log('用法:');
    console.log('  node index.js xlsx-to-md --xlsx <xlsxFile> --sheet <sheetName> --out <mdDir>');
    console.log('  node index.js md-to-epub --md-root <mdDir> --title <bookTitle> --author <author> --out <epubDir>');
}

function getArg(flag, defaultValue) {
    const idx = process.argv.indexOf(flag);
    if (idx !== -1 && idx + 1 < process.argv.length) {
        return process.argv[idx + 1];
    }
    return defaultValue;
}

async function main() {
    const cmd = process.argv[2];
    if (!cmd || cmd === '-h' || cmd === '--help') {
        printHelp();
        return;
    }

    if (cmd === 'xlsx-to-md') {
        const xlsxFile = getArg('--xlsx', '豆伴(38065370).xlsx');
        const sheet = getArg('--sheet', '日记');
        const outDir = getArg('--out', sheet);
        await runXlsxToMd({ xlsxFile, sheet, outDir });
        console.log(`XLSX 已导出到 Markdown：${outDir}`);
        return;
    }

    if (cmd === 'md-to-epub') {
        const mdRoot = getArg('--md-root', '日记');
        const title = getArg('--title', '梦开始的地方');
        const author = getArg('--author', '黄梦子');
        const outputDir = getArg('--out', 'epub');
        const out = await runMdToEpub({ mdRoot, title, author, outputDir });
        console.log(`EPUB 生成：${out}`);
        return;
    }

    console.error('未知命令：', cmd);
    printHelp();
    process.exitCode = 1;
}

main().catch(err => {
    console.error('运行失败：', err);
    process.exitCode = 1;
});
