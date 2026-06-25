/**
 * 图标预取脚本
 * 从 data.json 中提取所有外部图标 URL，下载并本地化，然后重写 data.json
 *
 * 用法：node scripts/fetch-icons.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'icons');
const DATA_PATH = join(ROOT, 'data.json');

// ========== 工具函数 ==========

/**
 * 从 URL 提取用于文件名的标识符
 * 优先从 Google favicons 服务的 domain 参数提取
 */
function extractSlug(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'www.google.com' && u.pathname === '/s2/favicons') {
      const domain = u.searchParams.get('domain');
      if (domain) return domain.replace(/\./g, '_');
    }
    let host = u.hostname.replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length >= 3) {
      host = parts.slice(-3).join('_');
    }
    return host.replace(/\./g, '_');
  } catch {
    return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  }
}

function isExternalUrl(url) {
  return /^https?:\/\//.test(url);
}

// ========== 核心逻辑 ==========

async function main() {
  console.log('=== 图标预取脚本 ===\n');

  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));

  const iconMap = new Map();
  const collected = [];

  function collect(url) {
    if (!url || !isExternalUrl(url)) return;
    if (iconMap.has(url)) return;
    const slug = extractSlug(url);
    let ext = '.png';
    try {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('.svg')) ext = '.svg';
      else if (pathname.endsWith('.ico')) ext = '.ico';
      else if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) ext = '.jpg';
    } catch {}
    iconMap.set(url, { slug, ext });
    collected.push({ url, slug, ext });
  }

  if (data.search?.quickLinks) {
    for (const link of data.search.quickLinks) collect(link.icon);
  }

  if (data.categories) {
    for (const cat of data.categories) {
      if (cat.sections) {
        for (const sec of cat.sections) {
          if (sec.items) for (const item of sec.items) collect(item.icon);
        }
      }
      if (cat.items) for (const item of cat.items) collect(item.icon);
    }
  }

  console.log(`发现 ${collected.length} 个唯一的外部图标 URL\n`);

  if (!existsSync(ICONS_DIR)) {
    mkdirSync(ICONS_DIR, { recursive: true });
    console.log(`创建目录: icons/\n`);
  }

  const urlToLocal = {};
  let success = 0, skipped = 0, failed = 0;

  for (const { url, slug, ext } of collected) {
    const outExt = ext === '.ico' ? '.png' : ext;
    const filename = `${slug}${outExt}`;
    const outPath = join(ICONS_DIR, filename);

    if (existsSync(outPath)) {
      console.log(`[跳过] ${url} → icons/${filename}`);
      urlToLocal[url] = `icons/${filename}`;
      skipped++;
      continue;
    }

    try {
      console.log(`[下载] ${url}`);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GitHubActions/1.0)' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (ext === '.ico' && buffer.length > 0) {
        try {
          const sharp = (await import('sharp')).default;
          const pngBuffer = await sharp(buffer)
            .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
          writeFileSync(outPath, pngBuffer);
          console.log(`  → icons/${filename} (ico→png, ${pngBuffer.length} bytes)`);
        } catch {
          writeFileSync(outPath, buffer);
          console.log(`  → icons/${filename} (raw, ${buffer.length} bytes)`);
        }
      } else {
        writeFileSync(outPath, buffer);
        console.log(`  → icons/${filename} (${buffer.length} bytes)`);
      }

      urlToLocal[url] = `icons/${filename}`;
      success++;
    } catch (err) {
      console.log(`  ✗ 失败: ${err.message}`);
      failed++;
    }
  }

  // 重写 data.json
  console.log(`\n重写 data.json 中的图标路径...`);
  const newData = JSON.parse(JSON.stringify(data));

  function replaceIcon(obj) {
    if (!obj) return;
    if (obj.icon && urlToLocal[obj.icon]) {
      obj.icon = urlToLocal[obj.icon];
    }
  }

  if (newData.search?.quickLinks) newData.search.quickLinks.forEach(replaceIcon);
  if (newData.categories) {
    for (const cat of newData.categories) {
      if (cat.sections) {
        for (const sec of cat.sections) {
          if (sec.items) sec.items.forEach(replaceIcon);
        }
      }
      if (cat.items) cat.items.forEach(replaceIcon);
    }
  }

  writeFileSync(DATA_PATH, JSON.stringify(newData, null, 2) + '\n', 'utf-8');
  console.log('data.json 已更新\n');

  console.log('=== 完成 ===');
  console.log(`  成功下载: ${success}`);
  console.log(`  跳过(已存在): ${skipped}`);
  console.log(`  失败: ${failed}`);
  if (failed > 0) console.log(`\n⚠  ${failed} 个图标下载失败，保留了原始 URL`);
}

main().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
