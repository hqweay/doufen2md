
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// 读取Excel文件
function readWorkbook(filename = '豆伴(64306053).xlsx') {
    const workbook = xlsx.readFile(filename);
    return workbook;
}

function readSheet(workbook, sheetName = '日记') {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    return data;
}

// 解析HTML内容
function parseHtml(html) {
    const $ = cheerio.load(html);
    // 保留基本格式
    $('br').replaceWith('\n');
    $('p').append('\n\n');
    $('div').append('\n\n');
    
    // 处理标题
    $('h1,h2,h3,h4,h5,h6').each((i, elem) => {
        const level = elem.name[1];
        $(elem).before('#'.repeat(level) + ' ');
        $(elem).append('\n\n');
    });

    // 处理列表
    $('ul,ol').append('\n');
    $('li').prepend('- ').append('\n');

    // 处理引用
    $('blockquote').prepend('> ').append('\n\n');

    // 处理加粗和斜体
    $('strong,b').each((i, elem) => {
        $(elem).before('**').after('**');
    });
    $('em,i').each((i, elem) => {
        $(elem).before('*').after('*');
    });

    return $.text().trim();
}

// 创建markdown文件
function createMarkdown(title, link, createTime, content, folder = '日记') {
    // 创建文件夹
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
    }

    // 处理文件名中的非法字符
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    const filePath = path.join(folder, `${safeTitle}.md`);
    
    // 写入内容
    const markdown = `---\nurl: ${link}\ncreateTime: ${createTime}\n---\n\n${content}`;
    fs.writeFileSync(filePath, markdown, 'utf8');
}

// 主函数
function main() {
    const workbook = readWorkbook();
    
    // 导出各类内容
    const sheetTypes = ['日记', '影评', '书评'];
    
    sheetTypes.forEach(type => {
        const data = readSheet(workbook, type);
        data.forEach(row => {
            const title = row['标题'];
            const link = row["链接"];
            const createTime = row["创建时间"];
            const content = parseHtml(row['内容']);
            
            if (type === '书评' || type === '影评') {
                const subject = row['评论对象'];
                createMarkdown(
                  `${subject}——${title}`,
                  link,
                  createTime,
                  content,
                  type
                );
            } else {
                createMarkdown(title, link, createTime, content, type);
            }
        });
        console.log(`${type}导出完成！`);
    });
}

main();
