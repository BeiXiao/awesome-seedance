#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * 生成 awesome-seedance 的多语言 README
 * 
 * 用法：
 *   node seedance-cases/generate-readme.js [--r2-base-url=https://r2.getseedance.com] [--out-dir=awesome-seedance]
 * 
 * 说明：
 *   - 图片格式：使用 webp 格式（最大 1080p）
 *   - 视频缩略图：使用 .thumb.webp 格式
 *   - 输出目录：默认输出到 awesome-seedance/，如果不存在则输出到 seedance-cases/
 */

const { readdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const LANG_MAP = {
  en: { name: "English", field: "prompt_en", readme: "README.md" },
  zh: { name: "简体中文", field: "prompt", readme: "README.zh.md" },
  zh_hant: { name: "繁體中文", field: "prompt_zh_hant", readme: "README.zh_hant.md" },
  jp: { name: "日本語", field: "prompt_jp", readme: "README.ja.md" },
  ko: { name: "한국어", field: "prompt_ko", readme: "README.ko.md" },
};

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

function getMediaType(fileName) {
  const name = String(fileName || "").toLowerCase();
  if (/\.(mp4|webm|mov|avi|mkv|flv|wmv)$/i.test(name)) return "video";
  if (/\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i.test(name)) return "audio";
  return "image";
}

/**
 * 获取视频缩略图文件名（webp 格式）
 * @param {string} fileName - 视频文件名，如 "Result1.mp4"
 * @returns {string} 缩略图文件名，如 "Result1.thumb.webp"
 */
function getVideoThumbFileName(fileName) {
  const name = String(fileName || "");
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  return `${base}.thumb.webp`;
}

/**
 * 生成媒体文件的 Markdown HTML 标签
 * @param {string} fileName - 文件名（图片使用 webp 格式，视频缩略图使用 .thumb.webp）
 * @param {string} r2BaseUrl - R2 基础 URL
 * @param {string} slug - case slug
 * @param {number} maxHeight - 最大高度（px）
 * @returns {string} Markdown HTML 标签
 */
function getMediaMarkdown(fileName, r2BaseUrl, slug, maxHeight = 200) {
  const type = getMediaType(fileName);
  const url = `${r2BaseUrl}/seedance-cases/${slug}/${fileName}`;
  
  if (type === "video") {
    // GitHub README 内嵌视频容易触发加载限制（Content length exceeded），改为“封面图 + 点击打开视频”
    // 视频缩略图使用 webp 格式：{videoName}.thumb.webp
    const thumbUrl = `${r2BaseUrl}/seedance-cases/${slug}/${getVideoThumbFileName(fileName)}`;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${thumbUrl}" alt="${fileName}" height="${maxHeight}" style="object-fit: contain;"></a>`;
  } else if (type === "audio") {
    return `<audio src="${url}" controls></audio>`;
  } else {
    // 图片统一高度，宽度自适应保持比例
    // 图片文件应使用 webp 格式（最大 1080p）
    return `<img src="${url}" alt="${fileName}" height="${maxHeight}" style="object-fit: contain;">`;
  }
}

function extractText(promptField) {
  if (!promptField) return "";
  if (typeof promptField === "string") return promptField;
  if (Array.isArray(promptField) && promptField.length > 0) {
    const first = promptField[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && first.text) return first.text;
  }
  return "";
}

function generateCaseSection(caseData, lang, r2BaseUrl) {
  const slug = caseData.slug;
  const promptField = LANG_MAP[lang].field;
  const promptText = extractText(caseData[promptField] || caseData.prompt_en || caseData.prompt || "");
  
  // 输入媒体
  const inputFiles = Array.isArray(caseData.input) ? caseData.input : [];
  const hasInput = inputFiles.length > 0;
  
  // 统一 input 高度为 200px，宽度自适应保持比例
  const inputHeight = 200;
  const inputMediaItems = inputFiles.map((f) => getMediaMarkdown(f, r2BaseUrl, slug, inputHeight));
  
  // 如果有多个 input，使用 HTML div 包裹以确保横排
  const inputMedia = inputFiles.length > 1 
    ? `<div style="white-space: nowrap;">${inputMediaItems.join(" ")}</div>`
    : inputMediaItems.join(" ");
  
  // 结果媒体
  const resultFiles = Array.isArray(caseData.result) ? caseData.result : [];
  const resultMedia = resultFiles
    .map((f) => getMediaMarkdown(f, r2BaseUrl, slug, 320))
    .join(" ");
  
  let section = `### ${slug}\n\n`;
  
  // Prompt 文本
  if (promptText) {
    section += `${promptText}\n\n`;
  }
  
  // Input 媒体（如果有）
  if (hasInput) {
    section += `**Input:**\n\n${inputMedia}\n\n`;
  }
  
  // Result 媒体（如果有）
  if (resultMedia) {
    section += `**Result:**\n\n${resultMedia}\n\n`;
  }
  
  return section;
}

function getIntroduction(lang) {
  const introductions = {
    en: `**Seedance 2.0** is a powerful multimodal video generation platform developed by ByteDance that supports image, video, audio, and text inputs. With advanced reference capabilities, you can precisely control composition, character details, camera movements, action rhythms, and creative effects. Seedance 2.0 enables smooth video extension and seamless scene transitions, allowing you to "continue filming" beyond just generation. Enhanced editing features support character replacement, deletion, and addition in existing videos. **Video creation is not just about generation—it's about controlling expression. Seedance 2.0 offers a truly controllable creative workflow.**

This repository aims to curate and showcase high-quality Seedance 2.0 video generation cases, providing a comprehensive collection of prompts, inputs, and results to help users understand the platform's capabilities and inspire creative video generation. **This repository is updated daily with new cases.**`,
    zh: `**Seedance 2.0** 是由字节跳动开发的一个强大的多模态视频生成平台，支持图像、视频、音频和文本四种模态输入。通过先进的参考能力，你可以精准控制画面构图、角色细节、镜头语言、动作节奏和创意特效。Seedance 2.0 支持视频平滑延长与衔接，让你能够"接着拍"，而不仅仅是生成。增强的编辑能力支持对已有视频进行角色更替、删减和增加。**视频创作从来不仅是"生成"，更是对表达的控制。Seedance 2.0 提供了一种真正可控的创作方式。**

本仓库旨在收集和展示高质量的 Seedance 2.0 视频生成案例，提供全面的提示词、输入素材和生成结果集合，帮助用户了解平台能力并激发创意视频生成灵感。**本仓库每天更新新案例。**`,
    zh_hant: `**Seedance 2.0** 是由字節跳動開發的一個強大的多模態視頻生成平台，支援圖像、視頻、音頻和文本四種模態輸入。透過先進的參考能力，你可以精準控制畫面構圖、角色細節、鏡頭語言、動作節奏和創意特效。Seedance 2.0 支援視頻平滑延長與銜接，讓你能夠"接著拍"，而不僅僅是生成。增強的編輯能力支援對已有視頻進行角色更替、刪減和增加。**視頻創作從來不僅是"生成"，更是對表達的控制。Seedance 2.0 提供了一種真正可控的創作方式。**

本倉庫旨在收集和展示高質量的 Seedance 2.0 視頻生成案例，提供全面的提示詞、輸入素材和生成結果集合，幫助用戶了解平台能力並激發創意視頻生成靈感。**本倉庫每天更新新案例。**`,
    jp: `**Seedance 2.0** は、バイトダンスが開発した強力なマルチモーダル動画生成プラットフォームで、画像、動画、音声、テキストの4つのモーダル入力をサポートします。高度な参照機能により、構図、キャラクターの詳細、カメラワーク、アクションのリズム、クリエイティブなエフェクトを正確に制御できます。Seedance 2.0 は動画のスムーズな延長とシームレスなシーン遷移を可能にし、「撮影を続ける」ことができます。強化された編集機能により、既存の動画でのキャラクターの置き換え、削除、追加がサポートされます。**動画制作は単なる生成ではなく、表現の制御です。Seedance 2.0 は真に制御可能なクリエイティブワークフローを提供します。**

このリポジトリは、高品質な Seedance 2.0 動画生成ケースをキュレートし、紹介することを目的としており、プロンプト、入力素材、生成結果の包括的なコレクションを提供し、ユーザーがプラットフォームの機能を理解し、創造的な動画生成のインスピレーションを得られるようにします。**このリポジトリは毎日新しいケースで更新されます。**`,
    ko: `**Seedance 2.0**은 바이트댄스가 개발한 강력한 멀티모달 비디오 생성 플랫폼으로, 이미지, 비디오, 오디오, 텍스트의 4가지 모달 입력을 지원합니다. 고급 참조 기능을 통해 구도, 캐릭터 세부사항, 카메라 움직임, 액션 리듬, 창의적 효과를 정확하게 제어할 수 있습니다. Seedance 2.0은 부드러운 비디오 확장과 원활한 장면 전환을 가능하게 하여 단순히 생성하는 것을 넘어 "계속 촬영"할 수 있습니다. 향상된 편집 기능은 기존 비디오에서 캐릭터 교체, 삭제, 추가를 지원합니다. **비디오 제작은 단순한 생성이 아니라 표현의 제어입니다. Seedance 2.0은 진정으로 제어 가능한 창작 워크플로우를 제공합니다.**

이 저장소는 고품질 Seedance 2.0 비디오 생성 사례를 큐레이션하고 소개하는 것을 목적으로 하며, 프롬프트, 입력 자료 및 생성 결과의 포괄적인 컬렉션을 제공하여 사용자가 플랫폼의 기능을 이해하고 창의적인 비디오 생성에 대한 영감을 얻을 수 있도록 합니다. **이 저장소는 매일 새로운 사례로 업데이트됩니다.**`,
  };
  return introductions[lang] || introductions.en;
}

function getLanguagesSection(lang) {
  const langLabels = {
    en: {
      title: "Languages",
      default: " (Default)",
      labels: {
        en: "English",
        zh: "简体中文",
        zh_hant: "繁體中文",
        jp: "日本語",
        ko: "한국어",
      },
    },
    zh: {
      title: "语言",
      default: "（默认）",
      labels: {
        en: "English",
        zh: "简体中文",
        zh_hant: "繁體中文",
        jp: "日本語",
        ko: "한국어",
      },
    },
    zh_hant: {
      title: "語言",
      default: "（預設）",
      labels: {
        en: "English",
        zh: "简体中文",
        zh_hant: "繁體中文",
        jp: "日本語",
        ko: "한국어",
      },
    },
    jp: {
      title: "言語",
      default: "（デフォルト）",
      labels: {
        en: "English",
        zh: "简体中文",
        zh_hant: "繁體中文",
        jp: "日本語",
        ko: "한국어",
      },
    },
    ko: {
      title: "언어",
      default: "（기본값）",
      labels: {
        en: "English",
        zh: "简体中文",
        zh_hant: "繁體中文",
        jp: "日本語",
        ko: "한국어",
      },
    },
  };
  
  const labels = langLabels[lang] || langLabels.en;
  const readmeFiles = {
    en: "README.md",
    zh: "README.zh.md",
    zh_hant: "README.zh_hant.md",
    jp: "README.ja.md",
    ko: "README.ko.md",
  };
  
  let section = `## ${labels.title}\n\n`;
  section += `- [${labels.labels.en}](${readmeFiles.en})\n`;
  section += `- [${labels.labels.zh}](${readmeFiles.zh})\n`;
  section += `- [${labels.labels.zh_hant}](${readmeFiles.zh_hant})\n`;
  section += `- [${labels.labels.jp}](${readmeFiles.jp})\n`;
  section += `- [${labels.labels.ko}](${readmeFiles.ko})\n\n`;
  
  return section;
}

function generateREADME(lang, cases, r2BaseUrl) {
  const langInfo = LANG_MAP[lang];
  const isEnglish = lang === "en";
  
  let content = `# Awesome Seedance${isEnglish ? "" : ` (${langInfo.name})`}\n\n`;
  
  // 添加介绍
  content += getIntroduction(lang) + `\n\n`;
  
  if (isEnglish) {
    content += `A curated collection of Seedance video generation cases and prompts.\n\n`;
  }
  
  // 所有语言版本都显示语言链接
  content += getLanguagesSection(lang);
  
  // 为所有语言版本添加 Contributing 部分（放在 Cases 之前）
  content += getContributingSection(lang);
  
  content += `## Cases\n\n`;
  content += `Total: **${cases.length}** cases\n\n`;
  
  for (const caseData of cases) {
    content += generateCaseSection(caseData, lang, r2BaseUrl);
  }
  
  // 为所有语言版本添加 License 部分（放在最后）
  content += getLicenseSection(lang);
  
  return content;
}

function getContributingSection(lang) {
  const contributingSections = {
    en: `## Contributing\n\nContributions are welcome! Please feel free to submit cases or open issues.\n\nPlease ensure that:\n\n- Provide publicly accessible links (social media links, YouTube, etc.) for your submissions\n\n`,
    zh: `## 贡献\n\n欢迎投稿！欢迎提交案例或提出 issues。\n\n请确保：\n\n- 提供公开可访问的链接（社媒链接、YouTube 等）\n\n`,
    zh_hant: `## 貢獻\n\n歡迎投稿！歡迎提交案例或提出 issues。\n\n請確保：\n\n- 提供公開可訪問的連結（社媒連結、YouTube 等）\n\n`,
    jp: `## 貢献\n\n貢献を歓迎します！ケースの提出や issue の作成を歓迎します。\n\n以下を確認してください：\n\n- 公開アクセス可能なリンク（SNSリンク、YouTubeなど）を提供してください\n\n`,
    ko: `## 기여\n\n기여를 환영합니다! 사례 제출이나 issue 생성에 자유롭게 참여해 주세요.\n\n다음을 확인해 주세요:\n\n- 공개적으로 접근 가능한 링크（소셜 미디어 링크、YouTube 등）를 제공해 주세요\n\n`,
  };
  return contributingSections[lang] || contributingSections.en;
}

function getLicenseSection(lang) {
  const licenseSections = {
    en: `\n## License\n\nThis collection is maintained by the Seedance community.\n`,
    zh: `\n## 许可\n\n本集合由 Seedance 社区维护。\n`,
    zh_hant: `\n## 許可\n\n本集合由 Seedance 社區維護。\n`,
    jp: `\n## ライセンス\n\nこのコレクションは Seedance コミュニティによって維持されています。\n`,
    ko: `\n## 라이선스\n\n이 컬렉션은 Seedance 커뮤니티에서 유지 관리합니다.\n`,
  };
  return licenseSections[lang] || licenseSections.en;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const casesDirAbs = join(cwd, "seedance-cases/cases");
  const r2BaseUrl = args["r2-base-url"] || "https://r2.getseedance.com";
  const outDirArg = args["out-dir"];
  const awesomeDirAbs = join(cwd, "awesome-seedance");
  const seedanceCasesDirAbs = join(cwd, "seedance-cases");
  const outDirAbs = outDirArg
    ? (outDirArg.startsWith("/") ? outDirArg : join(cwd, outDirArg))
    : (existsSync(awesomeDirAbs) ? awesomeDirAbs : seedanceCasesDirAbs);
  
  if (!existsSync(casesDirAbs)) {
    console.error("cases 目录不存在：", casesDirAbs);
    process.exit(1);
  }
  
  // 读取所有 case 数据
  const entries = readdirSync(casesDirAbs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{3}-/.test(d.name))
    .sort();
  
  const cases = [];
  
  for (const dirent of entries) {
    const caseDirAbs = join(casesDirAbs, dirent.name);
    const dataPath = join(caseDirAbs, "data.json");
    
    if (!existsSync(dataPath)) {
      console.warn("跳过：data.json 不存在：", dataPath);
      continue;
    }
    
    try {
      const data = JSON.parse(readFileSync(dataPath, "utf-8"));
      cases.push({
        slug: data.slug || dirent.name,
        id: data.ID || data.id,
        record_id: data.record_id,
        ...data,
      });
    } catch (err) {
      console.warn("跳过：无法解析 data.json：", dataPath, err.message);
    }
  }
  
  // 按 ID 排序
  cases.sort((a, b) => {
    const idA = parseInt(a.id || a.ID || "0", 10);
    const idB = parseInt(b.id || b.ID || "0", 10);
    return idA - idB;
  });
  
  console.log(`找到 ${cases.length} 个 cases，开始生成 README...\n`);
  
  // 为每种语言生成 README
  for (const [lang, langInfo] of Object.entries(LANG_MAP)) {
    const readmePath = join(outDirAbs, langInfo.readme);
    const content = generateREADME(lang, cases, r2BaseUrl);
    writeFileSync(readmePath, content, "utf-8");
    console.log(`✓ 已生成: ${langInfo.readme}`);
  }
  
  console.log(`\n完成！R2 Base URL: ${r2BaseUrl}`);
  console.log(`README 输出目录: ${outDirAbs}`);
  console.log(`\n注意：`);
  console.log(`- 图片文件应使用 webp 格式（最大 1080p）`);
  console.log(`- 视频缩略图应使用 .thumb.webp 格式`);
  console.log(`- 请确保所有媒体文件已上传到 R2: seedance-cases/{slug}/文件名`);
}

main();
