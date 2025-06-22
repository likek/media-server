#!/bin/bash

TARGET_DIR="$1"

if [[ -z "$TARGET_DIR" ]]; then
  echo "❌ 用法: $0 目标目录"
  exit 1
fi

find "$TARGET_DIR" -type f -name "*.gif" | while read gif_file; do
    dir=$(dirname "$gif_file")
    base=$(basename "$gif_file" .gif)
    tmp_palette="$dir/${base}_palette.png"
    tmp_output="$dir/${base}_compressed.gif"

    echo "🔄 压缩: $gif_file"

    # 生成调色板并压缩
    ffmpeg -y -i "$gif_file" -vf "fps=10,scale=320:-1:flags=lanczos,palettegen" "$tmp_palette" && \
    ffmpeg -y -i "$gif_file" -i "$tmp_palette" -filter_complex "fps=10,scale=320:-1:flags=lanczos [x]; [x][1:v] paletteuse" "$tmp_output"

    # 替换原文件
    if [[ -f "$tmp_output" ]]; then
        mv -f "$tmp_output" "$gif_file"
        echo "✅ 已替换: $gif_file"
    else
        echo "⚠️ 压缩失败: $gif_file"
    fi

    rm -f "$tmp_palette"
done