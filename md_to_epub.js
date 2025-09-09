const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const Epub = require('epub-gen');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

function parseCreateTime(createTime) {
    if (!createTime) return 0;
    const parsed = new Date(createTime);
    const time = parsed.getTime();
    return Number.isNaN(time) ? 0 : time;
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

function addSpaceBetweenChineseAndAscii(text) {
    let s = text || '';
    s = s.replace(/([\u4e00-\u9fff])([A-Za-z0-9]+)/g, '$1 $2');
    s = s.replace(/([A-Za-z0-9]+)([\u4e00-\u9fff])/g, '$1 $2');
    s = s.replace(/ {2,}/g, ' ');
    return s;
}

function buildEpubHtmlPreservingImages(originalHtml, rawTitle) {
    const $ = cheerio.load(originalHtml, { decodeEntities: false });
    const blocks = $('p, div, blockquote').toArray();
    const getText = (el) => $(el).text().replace(/\s+/g, ' ').trim();
    const cmp = (s) => (s || '').replace(/[\s\u00A0]/g, '');
    if (blocks.length > 0 && cmp(getText(blocks[0])) === cmp((rawTitle || '').trim())) {
        $(blocks[0]).remove();
    }
    const isAuthorMark = (s) => {
        const t = (s || '').trim();
        return t === '黄梦子' || t === '（黄梦子）';
    };
    const updated = $('p, div, blockquote').toArray();
    if (updated.length > 0 && isAuthorMark(getText(updated[0]))) {
        $(updated[0]).remove();
    }
    if (updated.length > 0 && isAuthorMark(getText(updated[updated.length - 1]))) {
        $(updated[updated.length - 1]).remove();
    }
    if (updated.length > 1 && isAuthorMark(getText(updated[updated.length - 2]))) {
        $(updated[updated.length - 2]).remove();
    }
    $('body, body *').contents().filter(function() { return this.type === 'text'; }).each(function() {
        const text = cheerio(this).text();
        let normalized = text.replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ');
        normalized = normalized.replace(/([。！？!?；;：:．…])\n(?=\S)/g, '$1\n\n');
        normalized = addSpaceBetweenChineseAndAscii(normalized);
        cheerio(this).replaceWith(normalized);
    });
    $('p, div, blockquote').each((i, el) => {
        const html = cheerio(el).html() || '';
        const parts = html.split(/\n\n+/);
        if (parts.length > 1) {
            const newHtml = parts.map(part => `<p>${part.replace(/\n/g, '<br/>')}</p>`).join('');
            cheerio(el).replaceWith(`<div>${newHtml}</div>`);
        } else {
            cheerio(el).html(html.replace(/\n/g, '<br/>'));
        }
    });
    return cheerio.load('')( 'body').html();
}

async function createEpub({ title, author = '自导出', items, outputDir = 'epub' }) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const safeTitle = title.replace(/[\\\/:*?"<>|]/g, '_');
    const outPath = path.join(outputDir, `${safeTitle}.epub`);
    const sorted = [...items].sort((a, b) => parseCreateTime(a.createTime) - parseCreateTime(b.createTime));
    const content = sorted.map(entry => ({
        title: entry.title,
        data: entry.html || entry.content || '',
    }));
    const option = { title, author, tocTitle: '目录', content };
    await new Epub(option, outPath);
    return outPath;
}

function readFrontMatter(md) {
    const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/m.exec(md);
    if (!match) return { attrs: {}, body: md };
    const attrs = {};
    match[1].split(/\n/).forEach(line => {
        const idx = line.indexOf(':');
        if (idx > -1) {
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            attrs[key] = value;
        }
    });
    return { attrs, body: match[2].trim() };
}

function mdParagraphTextToHtml(mdText) {
    const original = mdText || '';
    const placeholders = [];
    // 提前提取 Markdown 图片，避免被转义
    let replaced = original.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
        const index = placeholders.push({ alt, src }) - 1;
        return `__IMG_${index}__`;
    });

    // 转义剩余文本的特殊字符
    replaced = replaced.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 段落与换行
    let html = replaced
        .split(/\n{2,}/)
        .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`) // 单换行 -> <br/>
        .join('\n');

    // 回填图片占位符为 <img>
    html = html.replace(/__IMG_(\d+)__/g, (m, idxStr) => {
        const idx = Number(idxStr);
        const ph = placeholders[idx] || { alt: '', src: '' };
        // 不转义 alt 与 src，这里已是 HTML 注入点，来源可控（本地 MD）
        return `<img src="${ph.src}" alt="${ph.alt}"/>`;
    });

    return html;
}

async function runMdToEpub({ mdRoot = '日记', title = '梦开始的地方', author = '黄梦子', outputDir = 'epub' }) {
    const files = fs.readdirSync(mdRoot).filter(f => f.toLowerCase().endsWith('.md'));
    const items = [];
    files.forEach(filename => {
        const filePath = path.join(mdRoot, filename);
        const raw = fs.readFileSync(filePath, 'utf8');
        const { attrs, body } = readFrontMatter(raw);
        const createTime = attrs.createTime || '';
        const rawTitle = path.basename(filename, '.md');
        const titleNormalized = addSpaceBetweenChineseAndAscii(rawTitle);
        const textHtml = mdParagraphTextToHtml(body || '');
        let dataHtml = textHtml;
        const $ = cheerio.load(`<div>${dataHtml}</div>`, { decodeEntities: false });
        const tailText = $('div').text().trim().split(/\n/).filter(Boolean).pop() || '';
        if (!hasChineseYearMark(tailText)) {
            const dateLine = formatUpperChineseYmd(createTime);
            if (dateLine) {
                dataHtml = dataHtml.replace(/\s*$/, '') + `<p>${dateLine}</p>`;
            }
        }
        items.push({ title: titleNormalized, createTime, html: dataHtml });
    });
    // 缓存图片并替换为本地路径
    const cacheDir = path.join('cache', 'images');
    const processed = await Promise.all(items.map(async entry => {
        const html = await cacheImagesInHtml(entry.html, cacheDir);
        return { ...entry, html };
    }));
    const out = await createEpub({ title, author, items: processed, outputDir });
    return out;
}

module.exports = { runMdToEpub };

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function isHttpUrl(src) {
    try {
        const u = new URL(src);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

function hashString(s) {
    return crypto.createHash('md5').update(String(s)).digest('hex');
}

function getExtFromUrl(src) {
    try {
        const u = new URL(src);
        const pathname = u.pathname || '';
        const idx = pathname.lastIndexOf('.');
        if (idx > -1) {
            const ext = pathname.slice(idx).split('?')[0].split('#')[0];
            if (ext.length <= 6) return ext; // 简单限制
        }
        return '.jpg';
    } catch (e) {
        return '.jpg';
    }
}

function fetchImageBuffer(src, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        const isHttps = src.startsWith('https');
        const client = isHttps ? https : http;
        const req = client.get(src, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
                'Accept': 'image/avif,image/webp,image/apng,image/*;q=0.8,*/*;q=0.5',
            }
        }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (redirectCount >= 5) return reject(new Error('重定向过多'));
                const next = new URL(res.headers.location, src).toString();
                res.resume();
                return resolve(fetchImageBuffer(next, redirectCount + 1));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`下载失败：${src} 状态码 ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = res.headers['content-type'] || '';
                resolve({ buffer, contentType });
            });
        });
        req.on('error', reject);
        req.setTimeout(20000, () => {
            req.destroy(new Error('请求超时'));
        });
    });
}

async function cacheImagesInHtml(html, cacheDir) {
    ensureDir(cacheDir);
    const $ = cheerio.load(`<div>${html || ''}</div>`, { decodeEntities: false });
    const tasks = [];
    $('img').each((i, el) => {
        const src = $(el).attr('src') || '';
        if (!src) return;
        if (isHttpUrl(src)) {
            const guessedExt = getExtFromUrl(src);
            const name = hashString(src) + guessedExt;
            const localPath = path.join(cacheDir, name);
            if (fs.existsSync(localPath)) {
                $(el).attr('data-cache-path', localPath);
            } else {
                tasks.push((async () => {
                    try {
                        const { buffer, contentType } = await fetchImageBuffer(src);
                        if (buffer && buffer.length > 0) {
                            // 根据返回的 content-type 修正扩展名
                            let ext = guessedExt;
                            if (!ext || ext === '.jpg') {
                                if (contentType.includes('png')) ext = '.png';
                                else if (contentType.includes('gif')) ext = '.gif';
                                else if (contentType.includes('webp')) ext = '.webp';
                                else if (contentType.includes('svg')) ext = '.svg';
                                else if (contentType.includes('jpeg')) ext = '.jpg';
                            }
                            const fixedName = hashString(src) + ext;
                            const fixedLocalPath = path.join(cacheDir, fixedName);
                            fs.writeFileSync(fixedLocalPath, buffer);
                            $(el).attr('data-cache-path', fixedLocalPath);
                            $(el).attr('data-cache-mime', contentType || getMimeByExt(ext));
                        }
                    } catch (e) {
                        // 忽略单图错误
                    }
                })());
            }
        }
    });
    if (tasks.length) {
        await Promise.all(tasks);
    }
    // 将缓存的本地文件作为 img 的 src（绝对路径），让打包器收录为资源
    $('img').each((i, el) => {
        const cachePath = $(el).attr('data-cache-path');
        if (cachePath && fs.existsSync(cachePath)) {
            const abs = path.isAbsolute(cachePath) ? cachePath : path.resolve(cachePath);
            $(el).attr('src', abs);
            $(el).removeAttr('data-cache-path');
            $(el).removeAttr('data-cache-mime');
        }
    });
    return $('div').html() || '';
}

function getMimeByExt(ext) {
    switch ((ext || '').toLowerCase()) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.svg':
            return 'image/svg+xml';
        default:
            return 'image/jpeg';
    }
}


