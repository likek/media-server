import fs from "fs/promises";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { glob } from "glob";
import chalk from "chalk";
import path from "path";

const execAsync = promisify(exec);
const THRESHOLD = 1024 * 1024;
const maxSize = 6 * 1024 * 1024 * 1024; // 最大允许处理的文件大小 6 GB

// 支持的文件扩展名
const videoExtensions = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'];

// 检查 GPU 加速是否支持
const gpuAccelSupported = async () => {
  try {
    await execAsync('ffmpeg -encoders 2>&1 | grep "h264_nvenc"');
    return true;
  } catch {
    return false;
  }
};

const temp_file_xxx = ".tempftf";

// 转换为 MP4 格式
const convertToMp4 = async (file) => {
  const fileDir = path.dirname(file);
  const fileName = path.basename(file);
  const outputFileName = `${fileName.replace(/\.[^.]+$/, "")}.mp4`;
  const outputPath = path.join(fileDir, outputFileName);

  console.log(`开始转换文件: ${file} 为 MP4 格式`);

  try {
    const command = `cd "${fileDir}" && ffmpeg -i "${fileName}" "${outputFileName}"`;
    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(command, { shell: true });

      ffmpegProcess.stderr.on("data", (data) => {
        console.log(`stderr: ${data}`);
      });

      ffmpegProcess.on("close", async (code) => {
        if (code === 0) {
          console.log(chalk.green(`转换成功: ${outputPath}`));
           // 删除原始文件
           try {
            await fs.unlink(file);
            console.log(chalk.green(`已删除原始非 MP4 文件: "${file}"`));
          } catch (deleteError) {
            console.error(chalk.red(`删除原始文件失败: ${deleteError}`));
          }
          resolve(outputPath);
        } else {
          console.error(chalk.red(`转换失败，FFmpeg 结束时状态码为 ${code}`));
          reject(new Error(`FFmpeg 结束时状态码为 ${code}`));
        }
      });
    });

    return outputPath;
  } catch (error) {
    console.error(chalk.red(`转换文件时出错: ${error}`));
    throw error;
  }
};

// 处理单个文件
const processFile = async (file, useGpu) => {
  const fileDir = path.dirname(file);
  const fileName = path.basename(file);
  const outputFileName = `${fileName.replace(/\.mp4$/, "")}${temp_file_xxx}.mp4`;

  console.log(`开始处理文件: "${file}"`);

  try {
    try {
      const { stdout } = await execAsync(`cd "${fileDir}" && AtomicParsley "${fileName}" -T`);
      const moovPosition = stdout.match(/Atom moov.*?@ (\d+)/);
      const moovOffset = moovPosition ? parseInt(moovPosition[1], 10) : Infinity;

      console.log(`moov atom 位置: ${moovPosition ? moovPosition[0] : "未知"}`);

      if (moovOffset <= THRESHOLD) {
        console.log(chalk.yellow(`无需修改: ${file}`));
        return;
      }
    } catch (e) {
      console.log(chalk.red(`moov atom 位置检测出错: ${e}`));
    }

    console.log(chalk.blue(`${new Date().toLocaleString()} 正在处理中 (将 moov atom 移动到头部)...`));

    const command = useGpu
      ? `cd "${fileDir}" && ffmpeg -y -hwaccel cuda -i "${fileName}" -c:v h264_nvenc -movflags faststart -threads 8 "${outputFileName}"`
      : `cd "${fileDir}" && ffmpeg -y -i "${fileName}" -movflags faststart "${outputFileName}"`;

    await new Promise((resolve, reject) => {
      const ffmpegProcess = spawn(command, { shell: true });

      ffmpegProcess.stderr.on("data", (data) => {
        const stderrData = data.toString();
        if (/frame=\s*\d+/.test(stderrData)) {
          process.stdout.write(`\r处理进度: ${stderrData}`);
        }
      });

      ffmpegProcess.on("close", async (code) => {
        if (code === 0) {
          try {
            await fs.rename(path.join(fileDir, outputFileName), file);
            console.log(chalk.green(`\n${new Date().toLocaleString()} 已成功处理并替换: ${file}`));
            resolve();
          } catch (err) {
            console.error(chalk.red(`重命名文件时出错: ${err}`));
            reject(err);
          }
        } else {
          console.error(chalk.red(`FFmpeg 结束时状态码为 ${code}`));
          try {
            await fs.unlink(path.join(fileDir, outputFileName));
          } catch (unlinkError) {
            console.error(chalk.red(`删除错误输出文件时出错: ${unlinkError}`));
          }
          reject(new Error(`FFmpeg 结束时状态码为 ${code}`));
        }
      });
    });
  } catch (error) {
    console.error(chalk.red(`处理文件 "${file}" 时出错: ${error}`));
    try {
      await fs.unlink(path.join(fileDir, outputFileName));
    } catch (unlinkError) {
      console.error(chalk.red(`删除错误输出文件时出错: ${unlinkError}`));
    }
  }
};

// 获取要处理的目录
const targetDir = process.argv[2] || ".";

// 转换为适合平台的路径格式
const normalizedTargetDir = path.resolve(targetDir);

// 检查目标文件夹是否存在
try {
  await fs.access(normalizedTargetDir);
} catch {
  console.error(chalk.red(`目标文件夹 "${normalizedTargetDir}" 不存在`));
  process.exit(1);
}

// 使用 glob 的 Promise 版本
const findVideoFiles = async (pattern) => {
  console.log(`正在查找文件: ${pattern}`);
  const files = await glob(pattern, {});
  return files.filter((file) => !file.endsWith(`${temp_file_xxx}.mp4`));
};

// 主函数
const main = async () => {
  try {
    // 查找所有视频文件（多种格式）
    console.log("开始查找视频文件...");
    const files = await findVideoFiles(`${normalizedTargetDir.replace(/\\/g, "/")}/**/*.{${videoExtensions.join(',')}}`);
    console.log(`找到 ${files.length} 个视频文件`);

    // 检查是否支持 GPU 加速
    const useGpu = await gpuAccelSupported();
    console.log(`GPU 加速支持: ${useGpu}`);

    let skippedFiles = [];
    let i = 0;
    for (const file of files) {
      try {
        console.log(chalk.rgb(255, 0, 255)(`第${++i}/${files.length}个文件: ${file}`));
        const stats = await fs.stat(file);
        const fileSizeInBytes = stats.size;

        if (fileSizeInBytes > maxSize) {
          console.log(chalk.yellow(`文件过大，跳过: ${file}`));
          skippedFiles.push(file);
          continue;
        }

        let fileToProcess = file;

        // 如果文件不是 MP4，则先转换为 MP4
        if (!file.endsWith(".mp4")) {
          fileToProcess = await convertToMp4(file);
        }

        await processFile(fileToProcess, useGpu);
      } catch (error) {
        console.error(chalk.red(`处理文件时出错: ${error}`));
      }
    }

    if (skippedFiles.length > 0) {
      console.log(chalk.yellow(`以下文件由于大小超过限制而跳过:`));
      skippedFiles.forEach((file) => console.log(`- ${file}`));
    }

    console.log(chalk.green("所有文件处理完成"));
  } catch (error) {
    console.error(chalk.red(`查找文件时出错: ${error}`));
  }
};

main();
