import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

// 获取命令行参数中的目录路径
const targetDir = process.argv[2]

if (!targetDir) {
  console.error('❌ 请通过命令行参数指定要压缩的文件夹路径，例如：')
  console.error('   node compress-images.js ./your-folder')
  process.exit(1)
}

// 注意：压缩单张图片的逻辑已移至队列处理函数中

// 添加延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 限制并发数的队列处理
async function processImagesWithQueue(files, concurrency = 5) {
  const total = files.length
  let completed = 0
  let active = 0
  let fileIndex = 0

  return new Promise((resolve) => {
    // 处理器函数
    async function processor() {
      // 如果所有文件都已处理完毕，则结束
      if (fileIndex >= total) {
        if (active === 0) resolve()
        return
      }

      // 获取下一个文件并增加索引
      const currentFile = files[fileIndex++]
      active++

      try {
        await new Promise((resolveFile) => {
          const ext = path.extname(currentFile).toLowerCase()
          if (ext === '.png') {
            execFile('pngquant', ['--quality=65-95', '--ext=.png', '--force', currentFile], (err) => {
              if (err) {
                console.error(`pngquant 压缩失败: ${currentFile}`, err.message, `(错误代码: ${err.code})`)
              } else {
                console.log(`✅ [${++completed}/${total}] PNG 压缩成功: ${currentFile}`)
              }
              resolveFile()
            })
          } else if (ext === '.jpg' || ext === '.jpeg') {
            execFile('jpegoptim', ['--max=80', '--strip-all', '--all-progressive', currentFile], (err) => {
              if (err) {
                console.error(`jpegoptim 压缩失败: ${currentFile}`, err.message, `(错误代码: ${err.code})`)
              } else {
                console.log(`✅ [${++completed}/${total}] JPEG 压缩成功: ${currentFile}`)
              }
              resolveFile()
            })
          } else {
            resolveFile()
          }
        })

        // 添加小延迟，避免文件描述符耗尽
        await sleep(50)
      } catch (error) {
        console.error(`处理文件时出错: ${currentFile}`, error)
        completed++
      }

      active--
      // 继续处理下一个文件
      processor()
    }

    // 启动并发处理器
    for (let i = 0; i < Math.min(concurrency, total); i++) {
      processor()
    }
  })
}

// 递归遍历目录收集所有图片文件
function collectImageFiles(dir, fileList = []) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      collectImageFiles(fullPath, fileList)
    } else if (['.png', '.jpg', '.jpeg'].includes(path.extname(fullPath).toLowerCase())) {
      fileList.push(fullPath)
    }
  })
  return fileList
}

// 主函数
async function main() {
  try {
    console.log(`🔍 正在扫描目录: ${targetDir}`)
    const imageFiles = collectImageFiles(targetDir)
    console.log(`📊 找到 ${imageFiles.length} 个图片文件待处理`)
    
    if (imageFiles.length === 0) {
      console.log('没有找到需要压缩的图片文件')
      return
    }
    
    console.log('🚀 开始压缩图片...')
    await processImagesWithQueue(imageFiles)
    console.log('✨ 所有图片处理完成')
  } catch (error) {
    console.error('❌ 处理过程中发生错误:', error)
  }
}

main()