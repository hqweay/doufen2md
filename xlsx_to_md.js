const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

function readWorkbook(filename) {
    const workbook = xlsx.readFile(filename);
    return workbook;
}

function readSheet(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    return data;
}

function addSpaceBetweenChineseAndAscii(text) {
    let s = text || '';
    s = s.replace(/([\u4e00-\u9fff])([A-Za-z0-9]+)/g, '$1 $2');
    s = s.replace(/([A-Za-z0-9]+)([\u4e00-\u9fff])/g, '$1 $2');
    s = s.replace(/ {2,}/g, ' ');
    return s;
}

function numberToCn(n) {
    const digit = ['零','一','二','三','四','五','六','七','八','九'];
    if (n <= 10) {
        return n === 10 ? '十' : digit[n];
    }
    if (n < 20) {
        return '十' + digit[n - 10];
    }
    if (n % 10 === 0) {
        return digit[Math.floor(n / 10)] + '十';
    }
    return digit[Math.floor(n / 10)] + '十' + digit[n % 10];
}

function formatUpperChineseYmd(createTime) {
    if (!createTime) return '';
    const d = new Date(createTime);
    if (Number.isNaN(d.getTime())) return '';
    const yearDigits = String(d.getFullYear()).split('')
        .map(ch => ({'0':'零','1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'七','8':'八','9':'九'}[ch]))
        .join('');
    const month = numberToCn(d.getMonth() + 1);
    const day = numberToCn(d.getDate());
    return `${yearDigits}年${month}月${day}日`;
}

function hasChineseYearMark(line) {
    if (!line) return false;
    return /[一二三四五六七八九零]{2,4}年/.test(line);
}

function appendUpperDateIfMissing(mdContent, createTime) {
    const lines = (mdContent || '').split(/\n/);
    let idx = lines.length - 1;
    while (idx >= 0 && lines[idx].trim() === '') idx--;
    const lastLine = idx >= 0 ? lines[idx] : '';
    if (!hasChineseYearMark(lastLine)) {
        const dateLine = formatUpperChineseYmd(createTime);
        if (dateLine) {
            return (mdContent ? mdContent.replace(/\n+$/,'') + '\n\n' : '') + dateLine + '\n';
        }
    }
    return mdContent;
}

function parseHtml(html) {
    const $ = cheerio.load(html);
    $('br').replaceWith('\n');
    $('p').append('\n\n');
    $('div').append('\n\n');
    $('img').each((i, el) => {
        const src = $(el).attr('src') || '';
        const alt = $(el).attr('alt') || '';
        $(el).replaceWith(`\n\n![${alt}](${src})\n\n`);
    });
    $('h1,h2,h3,h4,h5,h6').each((i, elem) => {
        const level = elem.name[1];
        $(elem).before('#'.repeat(level) + ' ');
        $(elem).append('\n\n');
    });
    $('ul,ol').append('\n');
    $('li').prepend('- ').append('\n');
    $('blockquote').prepend('> ').append('\n\n');
    $('strong,b').each((i, elem) => {
        $(elem).before('**').after('**');
    });
    $('em,i').each((i, elem) => {
        $(elem).before('*').after('*');
    });
    return $.text().trim();
}

function normalizeParagraphsFromText(text, rawTitle) {
    const normalizeLineBreaks = (s) => (s || '').replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ');
    let normalized = normalizeLineBreaks(text);
    normalized = normalized.replace(/([。！？!?；;：:．…])\n(?=\S)/g, '$1\n\n');
    let paragraphs = normalized
        .split(/\n\s*\n+/)
        .map(p => {
            const lines = p.split(/\n/).map(line => line.trim());
            const joined = lines.join('\n').trim();
            return joined;
        })
        .filter(p => p.length > 0);
    const cmp = (s) => (s || '').replace(/[\s\u00A0]/g, '');
    if (paragraphs.length > 0 && cmp(paragraphs[0]) === cmp((rawTitle || '').trim())) {
        paragraphs.shift();
    }
    const isAuthorMark = (s) => {
        const t = (s || '').trim();
        return t === '黄梦子' || t === '（黄梦子）';
    };
    if (paragraphs.length > 0 && isAuthorMark(paragraphs[0])) {
        paragraphs.shift();
    }
    if (paragraphs.length > 0 && isAuthorMark(paragraphs[paragraphs.length - 1])) {
        paragraphs.pop();
    }
    let result = paragraphs.join('\n\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    result = addSpaceBetweenChineseAndAscii(result);
    return result;
}

function createMarkdown(title, link, createTime, content, folder) {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    const safeTitle = title.replace(/[\\\/:*?"<>|]/g, '_');
    const filePath = path.join(folder, `${safeTitle}.md`);
    const markdown = `---\nurl: ${link}\ncreateTime: ${createTime}\n---\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');
    return filePath;
}

async function runXlsxToMd({ xlsxFile, sheet = '日记', outDir = '日记' }) {
    const workbook = readWorkbook(xlsxFile);
    const data = readSheet(workbook, sheet);
    data.forEach(row => {
        const rawTitle = row['标题'];
        const link = row['链接'];
        const createTime = row['创建时间'];
        const html = row['内容'] || '';
        let mdContent = parseHtml(html);
        mdContent = normalizeParagraphsFromText(mdContent, rawTitle);
        mdContent = appendUpperDateIfMissing(mdContent, createTime);
        const title = addSpaceBetweenChineseAndAscii(rawTitle);
        createMarkdown(title, link, createTime, mdContent, outDir);
    });
}

module.exports = { runXlsxToMd };


