import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const execAsync = promisify(exec);

export type Framework = 'react' | 'vue';

/**
 * 用 Claude CLI 生成代码
 * 读取 Figma JSON，生成包含 data-figma-id 的 React/Vue 页面代码
 */
export async function generateCode(
  figmaJsonPath: string,
  framework: Framework,
  outputDir: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  const prompt = buildPrompt(framework, outputDir);

  // claude -p 非交互模式，传入 prompt
  // --model 用 sonnet 速度更快
  const cmd = [
    'claude',
    '-p', JSON.stringify(prompt),
    '--model', 'sonnet',
    '--output-format', 'text',
  ].join(' ');

  console.log(`[code-gen] Calling Claude CLI for ${framework}...`);
  console.log(`[code-gen] Figma JSON: ${figmaJsonPath}`);
  console.log(`[code-gen] Output: ${outputDir}`);

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: outputDir,
      timeout: 180_000, // 3 min
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        // 确保 Figma JSON 路径在环境中可用
        FIGMA_JSON_PATH: figmaJsonPath,
      },
    });

    if (stderr) {
      console.warn('[code-gen] Claude stderr:', stderr.slice(0, 500));
    }

    console.log(`[code-gen] Claude output length: ${stdout.length} chars`);

    // Claude CLI 会直接生成文件到 cwd，但我们也可以解析输出
    // 检查是否生成了文件
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(outputDir);
    console.log(`[code-gen] Files in output: ${files.join(', ')}`);

  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    console.error('[code-gen] Claude CLI failed:', error.message);
    if (error.stdout) console.error('[code-gen] stdout:', error.stdout.slice(0, 1000));
    if (error.stderr) console.error('[code-gen] stderr:', error.stderr.slice(0, 1000));
    throw err;
  }
}

function buildPrompt(framework: Framework, outputDir: string): string {
  const figmaJsonPath = process.env.FIGMA_JSON_PATH || './figma-data/h5-ecommerce.json';
  const mockJsonPath = process.env.MOCK_JSON_PATH || './figma-data/mock.json';

  const common = `
## 核心规则

1. 读取 Figma JSON 文件: ${figmaJsonPath}
2. 读取 Mock 数据文件: ${mockJsonPath}
3. 生成完整项目到当前目录: ${outputDir}
4. **data-figma-id**: 每个对应 Figma 节点的 DOM 元素必须添加 \`data-figma-id\` 属性，值为 Figma 节点的 id
5. 保持与 Figma 树一致的 DOM 层级关系

## Mock 数据渲染规则（非常重要）

- **必须读取 mock.json 并用真实数据渲染页面**，不要留空或写死 placeholder
- mock.json 包含: header（搜索栏占位文案、图标 SVG）、heroBanner（轮播图、标题、副标题）、categories（分类列表 + 商品卡片）
- 根据 Figma 树的结构，将 mock 数据映射到对应的节点上：
  - 搜索框节点 → 渲染 mock.header.searchPlaceholder
  - Banner 节点 → 渲染 mock.heroBanner 的图片/标题/副标题
  - 分类节点 → 遍历 mock.categories 渲染分类标题 + 商品列表
  - 商品卡片 → 渲染商品图片、名称、badge 标签
- 图片使用 mock.json 中的 URL（picsum.photos），直接作为 img src
- 图标 SVG 使用 mock.json 中的 inline SVG

## 响应式布局规则

- **不要给容器写死 width/height**，页面宽度由浏览器视口决定
- 根节点使用 \`width: 100%; min-height: 100vh\`，不要写固定像素值
- 使用 flex 布局 + 百分比/比例来分配空间
- 字号、间距、圆角、边框等细节属性可以用 px
- 图片用 \`max-width: 100%; height: auto\` 做自适应

## data-figma-id 规则
- Figma JSON 中每个节点有 id 字段（如 "3:4", "3:5"）
- 对应的 HTML 元素上添加 \`data-figma-id="3:4"\`
- 容器节点用 div，文本节点用 span/p
- 保持与 Figma 树一致的层级关系
`;

  if (framework === 'react') {
    return `你是一个前端代码生成器。请根据 Figma JSON 设计稿生成一个 React + TypeScript + Vite 的完整项目。

${common}

## 技术栈
- React 19 + TypeScript + Vite
- CSS Modules 或 styled-components 或内联样式均可
- 项目必须可以直接 \`npm install && npm run dev\` 启动

## 生成的文件结构
- package.json（包含 vite, react, react-dom, typescript 依赖）
- vite.config.ts
- tsconfig.json
- index.html
- src/main.tsx
- src/App.tsx（主页面组件，包含所有 UI）

请直接生成所有文件，不要解释。`;
  }

  return `你是一个前端代码生成器。请根据 Figma JSON 设计稿生成一个 Vue 3 + TypeScript + Vite 的完整项目。

${common}

## 技术栈
- Vue 3 + TypeScript + Vite
- scoped style 或内联样式均可
- 项目必须可以直接 \`npm install && npm run dev\` 启动

## 生成的文件结构
- package.json（包含 vite, vue, typescript 依赖）
- vite.config.ts
- tsconfig.json
- index.html
- src/main.ts
- src/App.vue（主页面组件，包含所有 UI）

请直接生成所有文件，不要解释。`;
}

/**
 * 备用方案：直接用 Node.js 生成简单的骨架代码（不依赖 Claude CLI）
 * 适用于没有 Claude CLI 的 CI 环境
 */
export async function generateCodeFallback(
  figmaJsonPath: string,
  framework: Framework,
  outputDir: string,
): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  const apiResponse = JSON.parse(await readFile(figmaJsonPath, 'utf-8'));
  // API 格式: { nodes: { "id": { document: {...} } } }
  const nodeKey = Object.keys(apiResponse.nodes)[0];
  const rootNode = apiResponse.nodes[nodeKey].document;

  // 读取 mock 数据
  const mockJsonPath = process.env.MOCK_JSON_PATH
    || figmaJsonPath.replace(/[^/\\]+$/, 'mock.json');
  let mock: Record<string, unknown> = {};
  try {
    mock = JSON.parse(await readFile(mockJsonPath, 'utf-8'));
  } catch {
    console.warn(`[code-gen] mock.json not found at ${mockJsonPath}, generating without data`);
  }

  await mkdir(outputDir, { recursive: true });

  if (framework === 'react') {
    await generateReactFallback(rootNode, outputDir, mock);
  } else {
    await generateVueFallback(rootNode, outputDir, mock);
  }
}

async function generateReactFallback(rootNode: Record<string, unknown>, outputDir: string, mock: Record<string, unknown>): Promise<void> {
  // 拷贝 mock.json 到项目中
  const mockJsonStr = JSON.stringify(mock, null, 2);

  await writeFile(join(outputDir, 'package.json'), JSON.stringify({
    name: 'figma-gen-react',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: { '@vitejs/plugin-react': '^4.0.0', vite: '^6.0.0', typescript: '^5.0.0' },
  }, null, 2));

  await writeFile(join(outputDir, 'vite.config.ts'), `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
`);

  await writeFile(join(outputDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true, isolatedModules: true, noEmit: true, jsx: 'react-jsx' },
    include: ['src'],
  }, null, 2));

  await writeFile(join(outputDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Figma Gen</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>`);

  await mkdir(join(outputDir, 'src'), { recursive: true });
  await writeFile(join(outputDir, 'src/mock.json'), mockJsonStr);

  await writeFile(join(outputDir, 'src/main.tsx'), `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
`);

  await writeFile(join(outputDir, 'src/App.tsx'), generateReactApp(mock));
}

async function generateVueFallback(rootNode: Record<string, unknown>, outputDir: string, mock: Record<string, unknown>): Promise<void> {
  const mockJsonStr = JSON.stringify(mock, null, 2);

  await writeFile(join(outputDir, 'package.json'), JSON.stringify({
    name: 'figma-gen-vue',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { vue: '^3.5.0' },
    devDependencies: { '@vitejs/plugin-vue': '^5.0.0', vite: '^6.0.0', typescript: '^5.0.0' },
  }, null, 2));

  await writeFile(join(outputDir, 'vite.config.ts'), `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({ plugins: [vue()] })
`);

  await writeFile(join(outputDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true, jsx: 'preserve' },
    include: ['src', 'src/**/*.vue'],
  }, null, 2));

  await writeFile(join(outputDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Figma Gen</title></head>
<body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>
</html>`);

  await mkdir(join(outputDir, 'src'), { recursive: true });
  await writeFile(join(outputDir, 'src/mock.json'), mockJsonStr);

  await writeFile(join(outputDir, 'src/main.ts'), `import { createApp } from 'vue'
import App from './App.vue'
createApp(App).mount('#app')
`);

  await writeFile(join(outputDir, 'src/App.vue'), generateVueApp(mock));
}

// ── 从 mock 数据生成带 data-figma-id 的页面组件 ──

function generateReactApp(mock: Record<string, unknown>): string {
  const header = mock.header as Record<string, unknown> | undefined;
  const hero = mock.heroBanner as Record<string, unknown> | undefined;
  const categories = mock.categories as Array<Record<string, unknown>> | undefined;

  const searchPlaceholder = (header?.searchPlaceholder as string) || '搜索';
  const bannerImage = (hero?.image as string) || '';
  const bannerTitle = (hero?.title as string) || '';
  const bannerSubtitle = (hero?.subtitle as string) || '';
  const bannerTagline = (hero?.tagline as string) || '';

  const catSections = (categories || []).map((cat, ci) => {
    const catTitle = cat.title as string;
    const catSubtitle = cat.subtitle as string;
    const products = cat.products as Array<Record<string, unknown>> || [];
    const productCards = products.map((p, pi) => {
      const badge = p.badge as string | null;
      return `          <div data-figma-id="product:${p.id}" style={{display:'flex',flexDirection:'column',width:'140px',flexShrink:0}}>
            <div style={{position:'relative',width:'140px',height:'140px',borderRadius:'8px',overflow:'hidden',backgroundColor:'#f5f5f5'}}>
              <img src="${p.image}" alt="${p.name}" style={{width:'100%',height:'100%',objectFit:'cover'}} />
${badge ? `              <span style={{position:'absolute',top:'4px',left:'4px',backgroundColor:'#ff4d4f',color:'#fff',fontSize:'10px',padding:'1px 4px',borderRadius:'2px'}}>${badge}</span>` : ''}
            </div>
            <span style={{fontSize:'12px',marginTop:'6px',color:'#333',lineHeight:'1.4'}}>${p.name}</span>
          </div>`;
    }).join('\n');

    return `      <div data-figma-id="category:${cat.id}" style={{backgroundColor:'#fff',borderRadius:'12px',padding:'16px',marginBottom:'12px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
          <div>
            <span style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a'}}>${catTitle}</span>
            <span style={{fontSize:'12px',color:'#999',marginLeft:'8px'}}>${catSubtitle}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:'10px',overflowX:'auto',paddingBottom:'4px'}}>
${productCards}
        </div>
      </div>`;
  }).join('\n');

  return `import mock from './mock.json'

export default function App() {
  return (
    <div data-figma-id="3:4" style={{width:'100%',minHeight:'100vh',backgroundColor:'#f6f7f9',fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'}}>
      {/* Header */}
      <div data-figma-id="3:5" style={{display:'flex',alignItems:'center',padding:'10px 16px',backgroundColor:'#fff',gap:'10px'}}>
        <div data-figma-id="search-box" style={{flex:1,display:'flex',alignItems:'center',backgroundColor:'#f0f1f3',borderRadius:'18px',padding:'8px 12px',gap:'6px'}}>
          <span dangerouslySetInnerHTML={{__html: mock.header.icons.search}} />
          <span style={{fontSize:'14px',color:'#8a8a8a'}}>{mock.header.searchPlaceholder}</span>
        </div>
        <span data-figma-id="cart-icon" dangerouslySetInnerHTML={{__html: mock.header.icons.cart}} />
      </div>

      {/* Hero Banner */}
      <div data-figma-id="hero-banner" style={{padding:'12px 16px'}}>
        <div style={{borderRadius:'12px',overflow:'hidden',position:'relative'}}>
          <img src={mock.heroBanner.image} alt="" style={{width:'100%',height:'auto',display:'block'}} />
          <div style={{position:'absolute',bottom:'16px',left:'16px',color:'#fff'}}>
            <div style={{fontSize:'11px',opacity:0.8}}>{mock.heroBanner.tagline}</div>
            <div style={{fontSize:'18px',fontWeight:'700',marginTop:'4px'}}>{mock.heroBanner.title}</div>
            <div style={{fontSize:'12px',marginTop:'2px',opacity:0.9}}>{mock.heroBanner.subtitle}</div>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div data-figma-id="category-stack" style={{padding:'0 16px 24px'}}>
${catSections}
      </div>
    </div>
  )
}
`;
}

function generateVueApp(mock: Record<string, unknown>): string {
  const header = mock.header as Record<string, unknown> | undefined;
  const hero = mock.heroBanner as Record<string, unknown> | undefined;
  const categories = mock.categories as Array<Record<string, unknown>> | undefined;

  const searchPlaceholder = (header?.searchPlaceholder as string) || '搜索';
  const bannerImage = (hero?.image as string) || '';
  const bannerTitle = (hero?.title as string) || '';
  const bannerSubtitle = (hero?.subtitle as string) || '';
  const bannerTagline = (hero?.tagline as string) || '';

  const catSections = (categories || []).map((cat) => {
    const catTitle = cat.title as string;
    const catSubtitle = cat.subtitle as string;
    const products = cat.products as Array<Record<string, unknown>> || [];
    const productCards = products.map((p) => {
      const badge = p.badge as string | null;
      return `          <div data-figma-id="product:${p.id}" class="product-card">
            <div class="product-img-wrap">
              <img :src="'${p.image}'" alt="${p.name}" />
${badge ? `              <span class="badge">${badge}</span>` : ''}
            </div>
            <span class="product-name">${p.name}</span>
          </div>`;
    }).join('\n');

    return `      <div data-figma-id="category:${cat.id}" class="category-card">
        <div class="category-header">
          <span class="category-title">${catTitle}</span>
          <span class="category-subtitle">${catSubtitle}</span>
        </div>
        <div class="product-list">
${productCards}
        </div>
      </div>`;
  }).join('\n');

  return `<template>
  <div data-figma-id="3:4" class="page">
    <!-- Header -->
    <div data-figma-id="3:5" class="header">
      <div data-figma-id="search-box" class="search-box">
        <span v-html="mock.header.icons.search"></span>
        <span class="search-text">{{ mock.header.searchPlaceholder }}</span>
      </div>
      <span data-figma-id="cart-icon" v-html="mock.header.icons.cart"></span>
    </div>

    <!-- Hero Banner -->
    <div data-figma-id="hero-banner" class="banner-wrap">
      <div class="banner-card">
        <img :src="mock.heroBanner.image" alt="" />
        <div class="banner-text">
          <div class="banner-tagline">{{ mock.heroBanner.tagline }}</div>
          <div class="banner-title">{{ mock.heroBanner.title }}</div>
          <div class="banner-subtitle">{{ mock.heroBanner.subtitle }}</div>
        </div>
      </div>
    </div>

    <!-- Categories -->
    <div data-figma-id="category-stack" class="categories">
${catSections}
    </div>
  </div>
</template>

<script setup lang="ts">
import mockData from './mock.json'
const mock = mockData as any
</script>

<style scoped>
.page { width: 100%; min-height: 100vh; background: #f6f7f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.header { display: flex; align-items: center; padding: 10px 16px; background: #fff; gap: 10px; }
.search-box { flex: 1; display: flex; align-items: center; background: #f0f1f3; border-radius: 18px; padding: 8px 12px; gap: 6px; }
.search-text { font-size: 14px; color: #8a8a8a; }
.banner-wrap { padding: 12px 16px; }
.banner-card { border-radius: 12px; overflow: hidden; position: relative; }
.banner-card img { width: 100%; height: auto; display: block; }
.banner-text { position: absolute; bottom: 16px; left: 16px; color: #fff; }
.banner-tagline { font-size: 11px; opacity: 0.8; }
.banner-title { font-size: 18px; font-weight: 700; margin-top: 4px; }
.banner-subtitle { font-size: 12px; margin-top: 2px; opacity: 0.9; }
.categories { padding: 0 16px 24px; }
.category-card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.category-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.category-title { font-size: 16px; font-weight: 600; color: #1a1a1a; }
.category-subtitle { font-size: 12px; color: #999; margin-left: 8px; }
.product-list { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
.product-card { display: flex; flex-direction: column; width: 140px; flex-shrink: 0; }
.product-img-wrap { position: relative; width: 140px; height: 140px; border-radius: 8px; overflow: hidden; background: #f5f5f5; }
.product-img-wrap img { width: 100%; height: 100%; object-fit: cover; }
.badge { position: absolute; top: 4px; left: 4px; background: #ff4d4f; color: #fff; font-size: 10px; padding: 1px 4px; border-radius: 2px; }
.product-name { font-size: 12px; margin-top: 6px; color: #333; line-height: 1.4; }
</style>
`;
}
