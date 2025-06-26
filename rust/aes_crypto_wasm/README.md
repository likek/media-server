# aes_crypto_wasm

该项目提供了一个用于 AES 加密和解密的 WebAssembly 模块。

## 环境准备

在开始之前，请确保您已安装以下工具：

*   **Rust**: 本项目使用 Rust 构建。如果您尚未安装，请通过 `rustup` 进行安装：
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
*   **wasm-pack**: 该工具用于构建 WebAssembly 模块。请使用以下命令安装：
    ```bash
    cargo install wasm-pack
    ```
*   **Node.js 和 yarn**: 构建过程使用 `yarn` 来管理 Node.js 依赖。我们推荐使用 `nvm` (Node 版本管理器) 来管理您的 Node.js 版本。
    *   请根据 [此处的官方指南](https://github.com/nvm-sh/nvm#installing-and-updating) 安装 `nvm`。
    *   安装 `nvm` 后，进入项目目录并运行 `nvm install`。该命令会自动读取 `.nvmrc` 文件并安装所需的 Node.js 版本。
    *   使用以下命令全局安装 `yarn`：
        ```bash
        npm install -g yarn
        ```

## 构建项目

完成所有环境准备工作后，您可以使用一个简单的命令来构建项目：

```bash
make build-server
```

该命令将在 `dist/nodejs` 目录中创建一个与 Node.js 兼容的 WebAssembly 模块，并将其作为依赖项添加到父项目中。