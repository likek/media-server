import path from "path";
import fs from "fs";
import jschardet from "jschardet";
import iconv from "iconv-lite";

function convertTxtEncoding(filePath, res) {
    const extname = path.extname(filePath);
    if (extname !== ".txt") {
      res.status(400).json({ message: "不是txt文件，跳过编码转换" });
      return;
    }
  
    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error("读取文件失败:", err);
        res.status(500).json({ message: "读取文件失败" });
        return;
      }
  
      // 检测文件编码
      const detectedEncoding = jschardet.detect(data).encoding;
      if (!detectedEncoding) {
        res.status(500).json({ message: "文件编码检测失败" });
        return;
      }
  
      // 判断文件是否为UTF-8编码
      if (detectedEncoding.toLowerCase() === "utf-8") {
        res.json({ message: "已经是UTF-8编码" });
        return;
      }
  
      // 将文件内容从原编码转换为UTF-8
      const content = iconv.decode(data, detectedEncoding);
      const utf8Content = iconv.encode(content, "utf-8");
  
      // 将转换后的内容写入文件
      fs.writeFile(filePath, utf8Content, (err) => {
        if (err) {
          console.error("写入文件失败:", err);
          res.status(500).json({ message: "写入文件失败" });
          return;
        }
        res.json({ message: "编码修改为UTF-8成功", success: true });
      });
    });
  }

  export {
    convertTxtEncoding
  }