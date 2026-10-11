# Photo_to_Icon

中文照片转图标工具 IconLab。支持本地图片和图片链接导入、多分辨率 ICO、独立 ICO、PNG 图标、实时预览和 ZIP 批量下载。图片在浏览器内处理。

## Windows 启动

双击根目录的 **启动工具.cmd**。本地服务启动成功后，会自动用默认浏览器打开工具页面。

运行时保持启动窗口打开，关闭窗口即可停止服务。需要可用的 Node.js 运行环境；启动脚本也会尝试使用 Codex 已提供的 Node.js 运行环境。

也可在项目目录中运行：

```powershell
node icon-studio/server.mjs --open
```

默认地址为 http://127.0.0.1:4173/ 。指定其他端口：

```powershell
node icon-studio/server.mjs 4174 --open
```

## 功能

- 点击或拖拽上传图片、图片链接导入，支持批量处理。
- JPG、PNG、GIF、WEBP、SVG、HEIC / HEIF。
- 多分辨率 ICO、每个尺寸独立的 ICO、PNG 图标。
- 16–256 像素常用尺寸及自定义宽高。
- 实时预览、居中裁剪、完整保留、圆角、透明度及背景色设置。
- 单个下载、ZIP 打包、结果清空及重置。
- 中文使用指南及响应式手机布局。

详细使用说明见 [icon-studio/README.md](icon-studio/README.md)。

## 验证

```powershell
node --test icon-studio/tests/core.test.cjs
```

验证记录见 [VALIDATION.md](icon-studio/VALIDATION.md)。HEIC 解码库的许可证及源码信息见 [THIRD_PARTY_NOTICES.md](icon-studio/THIRD_PARTY_NOTICES.md)。

## 目录

- 启动工具.cmd：Windows 启动入口
- icon-studio/dist/：网页界面、转换逻辑与 HEIC 解码器
- icon-studio/server.mjs：本地静态服务器
- icon-studio/tests/：ICO 和 ZIP 编码测试
