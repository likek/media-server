import fs from "fs";
import path from "path";
import { loadImageAsPngBuffer } from "./imageLoader.js";
import { APP_MODEL_CACHE_FULL_PATH, MODEL_CACHE_FULL_PATH } from "../../serverConfig.js";

const MODEL_ID = "Xenova/clip-vit-base-patch16";
let instance;

function hasPreparedModelCache(cacheDir) {
  return fs.existsSync(path.join(cacheDir, MODEL_ID, "onnx", "vision_model.onnx"));
}

function resolveModelCacheDir() {
  if (hasPreparedModelCache(MODEL_CACHE_FULL_PATH)) {
    return MODEL_CACHE_FULL_PATH;
  }
  if (hasPreparedModelCache(APP_MODEL_CACHE_FULL_PATH)) {
    return APP_MODEL_CACHE_FULL_PATH;
  }
  return MODEL_CACHE_FULL_PATH;
}

async function getModel() {
  if (instance) return instance;
  const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage, LogLevel } = await import("@huggingface/transformers");
  env.logLevel = LogLevel.ERROR;
  env.cacheDir = resolveModelCacheDir();
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  const vision_model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID);
  instance = { processor, vision_model, RawImage, modelId: MODEL_ID };
  return instance;
}

export const IMAGE_EMBEDDING_MODEL_ID = MODEL_ID;

export async function computeClipEmbeddingFromFile(filePath) {
  const { processor, vision_model, RawImage, modelId } = await getModel();
  const buffer = await loadImageAsPngBuffer(filePath);
  const image = await RawImage.fromBlob(new Blob([buffer], { type: "image/png" }));
  const inputs = await processor(image);
  const { image_embeds } = await vision_model(inputs);
  const data = image_embeds.data;
  normalizeInPlace(data);
  return { modelId, dim: image_embeds.dims[1], vector: data };
}

function normalizeInPlace(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
}
