# media-server

一个面向本地媒体文件管理、检索、预览与上传的轻量级服务。

## 启动

- 首次启动或代码更新后，先执行：`./build-all`
- 构建完成后，启动服务：`node server.js --path <媒体目录>`
- 浏览器中打开：`http://127.0.0.1:7777`

## 发布命令

- 生成发布目录：`./build-release`
- 发布产物生成后：
  - 目录默认位于 `./release`
  - macOS / Linux 启动命令：`./bin/start.sh --path /your/media/path`
  - Windows 启动命令：`bin\start.bat --path D:\media`

## 运行依赖

- 本项目的视频缩略图生成和视频元数据解析依赖系统安装的 `ffmpeg` 和 `ffprobe`
- macOS 安装命令：`brew install ffmpeg`
- 安装完成后可验证：`ffmpeg -version` 和 `ffprobe -version`
- 如果项目是打包后运行，也需要保证打包运行环境可以直接访问这两个命令
- 若仍报 `Cannot find ffprobe`，先执行 `which ffmpeg` 和 `which ffprobe` 检查 PATH

## 相关链接

- [ffmpeg 下载](https://ffmpeg.org/download.html)
- [N_m3u8DL-RE](https://github.com/nilaoda/N_m3u8DL-RE)
- Mac 下使用 `N_m3u8DL-RE` 时需设置信任
