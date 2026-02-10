#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 将 seedance-cases/cases 下的图片压缩到最大 1080p，并转成 webp 替换原文件。
 * 同时更新每个 case 的 data.json（input 等字段的文件名、_r2Urls/_r2UploadTimes）。
 *
 * 用法：
 *   node seedance-cases/convert-images-to-webp.js
 *   node seedance-cases/convert-images-to-webp.js --cases-dir=seedance-cases/cases --max=1080 --quality=82
 */

const {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  unlinkSync,
  renameSync,
} = require("node:fs");
const { join, extname, basename } = require("node:path");
const { spawnSync } = require("node:child_process");

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const idx = a.indexOf("=");
    if (idx === -1) args[a.slice(2)] = true;
    else args[a.slice(2, idx)] = a.slice(idx + 1);
  }
  return args;
}

function isConvertibleImage(fileName) {
  const ext = extname(fileName).toLowerCase();
  return ext === ".png" || ext === ".jpg" || ext === ".jpeg";
}

function toWebpName(fileName) {
  const ext = extname(fileName);
  const base = fileName.slice(0, -ext.length);
  return `${base}.webp`;
}

function replaceStringsDeep(value, mapping) {
  if (typeof value === "string") return mapping[value] || value;
  if (Array.isArray(value)) return value.map((v) => replaceStringsDeep(v, mapping));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = replaceStringsDeep(v, mapping);
  return out;
}

function runMagickToWebp(inputAbs, outputAbs, maxSize, quality) {
  // -resize 1080x1080> 只在超过上限时缩放（保持比例）
  const args = [
    inputAbs,
    "-resize",
    `${maxSize}x${maxSize}>`,
    "-strip",
    "-quality",
    String(quality),
    outputAbs,
  ];
  const res = spawnSync("magick", args, { encoding: "utf-8" });
  if (res.status !== 0) {
    const msg = (res.stderr || res.stdout || "").trim();
    throw new Error(msg || `magick 失败（exit=${res.status}）`);
  }
}

function listFiles(dirAbs) {
  return readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

function ensureFile(absPath) {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function pruneObjectToExistingKeys(obj, existingKeys) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const k of Object.keys(obj)) {
    if (existingKeys.has(k)) out[k] = obj[k];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const casesDirRel = args["cases-dir"] || "seedance-cases/cases";
  const casesDirAbs = casesDirRel.startsWith("/") ? casesDirRel : join(cwd, casesDirRel);
  const maxSize = Number.parseInt(args.max || "1080", 10);
  const quality = Number.parseInt(args.quality || "82", 10);

  if (!existsSync(casesDirAbs)) {
    console.error("cases 目录不存在：", casesDirAbs);
    process.exit(1);
  }

  const entries = readdirSync(casesDirAbs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{3}-/.test(d.name))
    .sort();

  let totalImages = 0;
  let convertedImages = 0;
  let updatedCases = 0;
  let skippedImages = 0;

  console.log(`找到 ${entries.length} 个 case 目录`);
  console.log(`开始转换：max=${maxSize}, quality=${quality}\n`);

  for (let i = 0; i < entries.length; i++) {
    const dirent = entries[i];
    const caseDirAbs = join(casesDirAbs, dirent.name);
    const dataPath = join(caseDirAbs, "data.json");

    if (!existsSync(dataPath)) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(dataPath, "utf-8"));
    } catch {
      continue;
    }

    const slug = data.slug || dirent.name;
    const r2BaseUrl = String(data._r2BaseUrl || args["r2-base-url"] || "https://r2.getseedance.com").replace(
      /\/$/,
      ""
    );

    const fileNames = listFiles(caseDirAbs);
    const imageFiles = fileNames.filter(isConvertibleImage);
    if (!imageFiles.length) continue;

    const mapping = {};

    for (const oldName of imageFiles) {
      totalImages++;
      const oldAbs = join(caseDirAbs, oldName);
      const newName = toWebpName(oldName);
      const newAbs = join(caseDirAbs, newName);
      const tmpAbs = join(caseDirAbs, `${basename(newName, ".webp")}.webp.tmp`);

      // 如果已经有同名 webp，跳过（但仍尝试删除旧图并更新映射）
      if (ensureFile(newAbs)) {
        mapping[oldName] = newName;
        try {
          if (ensureFile(oldAbs)) unlinkSync(oldAbs);
        } catch {}
        skippedImages++;
        continue;
      }

      try {
        runMagickToWebp(oldAbs, tmpAbs, maxSize, quality);
        if (!ensureFile(tmpAbs)) throw new Error("输出文件不存在");

        // 覆盖写入
        if (ensureFile(newAbs)) unlinkSync(newAbs);
        renameSync(tmpAbs, newAbs);
        unlinkSync(oldAbs);

        mapping[oldName] = newName;
        convertedImages++;
      } catch (err) {
        // 清理 tmp
        try {
          if (ensureFile(tmpAbs)) unlinkSync(tmpAbs);
        } catch {}
        console.warn(`⚠️  [${slug}] 转换失败: ${oldName}: ${err.message}`);
      }
    }

    const mappingKeys = Object.keys(mapping);
    if (!mappingKeys.length) continue;

    // 更新 data.json（递归替换所有完全匹配的文件名字符串）
    const nextData = replaceStringsDeep(data, mapping);

    // 更新 _r2Urls / _r2UploadTimes：移除旧 key，新增新 key，并把 uploadTime 置 0 强制重新上传
    const nextUrls = { ...(nextData._r2Urls || {}) };
    const nextTimes = { ...(nextData._r2UploadTimes || {}) };

    for (const [oldName, newName] of Object.entries(mapping)) {
      delete nextUrls[oldName];
      delete nextTimes[oldName];
      nextUrls[newName] = `${r2BaseUrl}/seedance-cases/${slug}/${newName}`;
      nextTimes[newName] = 0;
    }

    // prune：只保留当前目录真实存在的媒体文件 keys（避免遗留 png）
    const existing = new Set(listFiles(caseDirAbs));
    nextData._r2Urls = pruneObjectToExistingKeys(nextUrls, existing);
    nextData._r2UploadTimes = pruneObjectToExistingKeys(nextTimes, existing);

    // 标记仍为已上传（但由于 uploadTimes=0，会触发重新上传）
    nextData._r2Uploaded = true;
    nextData._r2UploadedAt = nextData._r2UploadedAt || new Date().toISOString();
    nextData._r2BaseUrl = r2BaseUrl;

    try {
      writeFileSync(dataPath, JSON.stringify(nextData, null, 2), "utf-8");
      updatedCases++;
    } catch (err) {
      console.warn(`⚠️  [${slug}] 写入 data.json 失败: ${err.message}`);
    }
  }

  console.log("\n完成！");
  console.log(`- 扫描到图片: ${totalImages}`);
  console.log(`- 转换成功: ${convertedImages}`);
  console.log(`- 已存在 webp 跳过: ${skippedImages}`);
  console.log(`- 更新 case: ${updatedCases}`);
}

main();

