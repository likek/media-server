降低码率到"5M": `ffmpeg -i input.mp4 -c:v h264_nvenc -b:v 5M -threads 8 output.mp4`
启用mp4的"快速启动"：
 - CPU方式：`ffmpeg -i input.mp4 -movflags faststart output.mp4`
 - GPU加速和多线程 `ffmpeg -hwaccel cuda -i input.mp4 -c:v h264_nvenc -movflags faststart -threads 8 output.mp4`

运行依赖：
 - 本项目的视频缩略图生成和视频元数据解析依赖系统安装的 `ffmpeg` 和 `ffprobe`
 - macOS 安装命令：`brew install ffmpeg`
 - 安装完成后可验证：`ffmpeg -version` 和 `ffprobe -version`
 - 如果项目是打包后运行，也需要保证打包运行环境可以直接访问这两个命令
 - 若仍报 `Cannot find ffprobe`，先执行：`which ffmpeg` 和 `which ffprobe` 检查 PATH

 cargo test
 wasm-pack build --target bundler -d dist/bundler // 前端import使用
 wasm-pack build --target web -d dist/web // 不用这种
 wasm-pack build --target nodejs -d dist/nodejs // 后端nodejs里import使用
