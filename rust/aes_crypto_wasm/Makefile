.PHONY: build-front-end build-server clean

# 构建前端用的 bundler 版本
build-front-end:
	rm -rf ./dist/bundler
	@echo "🔧 构建前端用的 wasm 模块..."
	@set -e; \
	wasm-pack build --target bundler --out-dir ./dist/bundler --out-name xxx; \
	rm -rf ../../front-end/wasm/xxx/*; \
	cp -r ./dist/bundler/* ../../front-end/wasm/xxx/; \
	cd ../../front-end && yarn add ./wasm/xxx; \
	echo "✅ 前端构建完成并已安装模块"

# 构建给 Node.js 服务端使用的版本
build-server:
	rm -rf ./dist/nodejs
	@echo "🔧 构建 Node.js 用的 wasm 模块..."
	@set -e; \
	wasm-pack build --target nodejs --out-dir ./dist/nodejs --out-name xxx; \
	cd ../../ && yarn add ./rust/aes_crypto_wasm/dist/nodejs; \
	echo "✅ 服务端构建完成并已安装模块"
