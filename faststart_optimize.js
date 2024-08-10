import fs from "fs/promises";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { glob } from "glob";
import chalk from "chalk";
import path from "path";

const execAsync = promisify(exec);
const THRESHOLD = 1024 * 1024;

// 判断是否支持 GPU 加速
const gpuAccelSupported = async () => {
  try {
    await execAsync('ffmpeg -encoders 2>&1 | grep "h264_nvenc"');
    return true;
  } catch {
    return false;
  }
};

// 处理单个文件
const processFile = async (file, useGpu) => {
  const fileDir = path.dirname(file);
  const fileName = path.basename(file);
  const outputFileName = `${fileName.replace(/\.mp4$/, "")}-faststart.mp4`;

  console.log(`开始处理文件: "${file}"`);

  try {
    const { stdout } = await execAsync(`cd "${fileDir}" && AtomicParsley "${fileName}" -T`);
    const moovPosition = stdout.match(/Atom moov.*?@ (\d+)/);
    const moovOffset = moovPosition ? parseInt(moovPosition[1], 10) : Infinity;

    console.log(`moov atom 位置: ${moovPosition ? moovPosition[0] : "未知"}`);

    if (moovOffset <= THRESHOLD) {
      console.log(chalk.yellow(`无需修改: ${file}`));
      return;
    }

    console.log(
      chalk.blue(
        `${new Date().toLocaleString()} 正在处理中 (将 moov atom 移动到头部)...`
      )
    );

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
            console.log(
              chalk.green(
                `\n${new Date().toLocaleString()} 已成功处理并替换: ${file}`
              )
            );
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
const findMp4Files = async (pattern) => {
  console.log(`正在使用 glob 查找文件: ${pattern}`);
  const files = await glob(pattern, {});
  console.log(`glob 查找到 ${files.length} 个文件`);
  return files.filter((file) => !file.endsWith("-faststart.mp4")); // 排除临时文件
};

// 主函数
const main = async () => {
  try {
    const maxSize = 6 * 1024 * 1024 * 1024;
    // 遍历目标文件夹及其子文件夹下所有 mp4 文件
    console.log("开始查找 MP4 文件...");
    const files = await findMp4Files(`${normalizedTargetDir.replace(/\\/g, "/")}/**/*.mp4`);
    console.log(`找到 ${files.length} 个 MP4 文件`);

    // 检查是否支持 GPU 加速
    const useGpu = await gpuAccelSupported();
    console.log(`GPU 加速支持: ${useGpu}`);

    let skippedFiles = []; // 用于记录跳过的文件
    let i = 0;
    for (const file of files) {
      try {
        console.log(chalk.rgb(255, 0, 255)(`第${++i}个文件: ${file}`));
        const stats = await fs.stat(file); // 获取文件信息
        const fileSizeInBytes = stats.size;

        if (fileSizeInBytes > maxSize) {
          // 文件大小超过 6 GB
          console.log(
            chalk.yellow(
              `文件过大 (${(fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(
                2
              )} GB)，跳过处理`
            )
          );
          skippedFiles.push(file); // 记录跳过的文件
          console.log("\n");
          continue;
        }

        await processFile(file, useGpu);
      } catch (error) {
        console.error(chalk.red(`文件 "${file}" 不存在或不可读: ${error}`));
      }
      console.log("\n");
    }

    // 汇总跳过的文件信息
    if (skippedFiles.length > 0) {
      console.log(
        chalk.yellow(
          `以下文件由于大小超过 ${maxSize / (1024 * 1024 * 1024)} GB 而被跳过:`
        )
      );
      skippedFiles.forEach((file) => {
        console.log(`- ${file}`);
      });
    }
    console.log("\n");

    console.log(chalk.green("所有文件处理完成"));
  } catch (error) {
    console.error(chalk.red(`Error finding .mp4 files: ${error}`));
  }
};

main();
