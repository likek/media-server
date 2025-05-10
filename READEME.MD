降低码率到"5M": `ffmpeg -i input.mp4 -c:v h264_nvenc -b:v 5M -threads 8 output.mp4`
启用mp4的"快速启动"：
 - CPU方式：`ffmpeg -i input.mp4 -movflags faststart output.mp4`
 - GPU加速和多线程 `ffmpeg -hwaccel cuda -i input.mp4 -c:v h264_nvenc -movflags faststart -threads 8 output.mp4`

 cargo test
 wasm-pack build --target bundler -d dist/bundler // 前后端都能import放使用
 wasm-pack build --target nodejs -d dist/nodejs // 只能后端nodejs 里require使用
 wasm-pack build --target web -d dist/web // 浏览器里import使用