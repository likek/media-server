import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'

// 获取命令行参数中的目录路径
const targetDir = process.argv[2]

if (!targetDir) {
  console.error('❌ 请通过命令行参数指定要压缩的文件夹路径，例如：')
  console.error('   node compress-images.js ./your-folder')
  process.exit(1)
}

// 压缩单张图片
function compressImage(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') {
    execFile('pngquant', ['--quality=65-95', '--ext=.png', '--force', filePath], (err) => {
      if (err) {
        console.error(`pngquant 压缩失败: ${filePath}`, err.message)
      } else {
        console.log(`✅ PNG 压缩成功: ${filePath}`)
      }
    })
  } else if (ext === '.jpg' || ext === '.jpeg') {
    execFile('jpegoptim', ['--max=80', '--strip-all', '--all-progressive', filePath], (err) => {
      if (err) {
        console.error(`jpegoptim 压缩失败: ${filePath}`, err.message)
      } else {
        console.log(`✅ JPEG 压缩成功: ${filePath}`)
      }
    })
  }
}

// 递归遍历目录
function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      walkDir(fullPath)
    } else if (['.png', '.jpg', '.jpeg'].includes(path.extname(fullPath).toLowerCase())) {
      compressImage(fullPath)
    }
  })
}

walkDir(targetDir)