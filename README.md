# 刷题本（网页版）

纯前端刷题应用，题库来自 `../ai-trainer-quiz-main/data/questions.xlsx`（人工智能训练师，2246 题）。

## 功能

- 首页按**等级 / 题型 / 章节**筛选，顺序或随机出题，题量 10 / 20 / 50 / 100 / 全部
- 逐题即时判分，显示正确答案与解析（含答案来源标签）
- **错题本**：答错自动收录；答对自动移出，再答错累计错误次数；支持全部重做 / 优先重做老错题 / 单题重做 / 手动移除
- 进度自动保存（localStorage），刷新后可**继续练习**
- 成绩页：得分、错题列表、一键重做本次错题
- 备份导出 / 导入（JSON）、深色模式、键盘快捷键（`1~5`/`A~E` 选择，`Enter` 下一题，`←` `→` 翻页）

## 运行

方式一：双击 `index.html` 直接使用（题库以 JS 形式内嵌，无跨域问题）。

方式二：本地服务器（任选其一）：

```bash
node serve.mjs        # http://127.0.0.1:8080
# 或 npx serve .
```

## 部署到 GitHub Pages

这是**纯静态站点**（无后端、无构建步骤），两种方式任选：

### 方式 A：把 quiz-app 作为仓库根目录（推荐）

```powershell
cd D:\Ming\train\quiz-app
git init
git add -A
git commit -m "刷题本"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后到 GitHub 仓库页面：**Settings → Pages → Source** 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`。
（仓库里已带 `.github/workflows/deploy.yml`，也可以改用 GitHub Actions 自动部署；`.nojekyll` 已就位。）

约 1 分钟后访问 `https://<你的用户名>.github.io/<仓库名>/` 即可。

### 方式 B：从现有仓库的子目录发布

如果 quiz-app 只是你仓库里的一个子目录，把 `index.html`、`assets/`、`data/` 拷到要发布的分支/目录即可（如 `gh-pages` 分支根目录），其余文件（`build.mjs`、`serve.mjs`、`README.md`）不需要部署。

> 进度存在浏览器 localStorage 中，GitHub Pages 域名下同样可用；换设备可用首页的「导出备份 / 导入备份」迁移。

## 更新题库

修改 xlsx 后重新生成数据：

```bash
# 在 D:\Ming\train 下执行（依赖根目录 node_modules 里的 xlsx）
node quiz-app/build.mjs
```

## 目录

```
quiz-app/
├── index.html        页面入口
├── assets/
│   ├── style.css     样式（深浅色、响应式）
│   └── app.js        全部逻辑
├── data/questions.js 题库（由 build.mjs 生成，勿手工编辑）
├── build.mjs         xlsx → questions.js 转换脚本（含数据校验）
└── serve.mjs         零依赖静态服务器
```
