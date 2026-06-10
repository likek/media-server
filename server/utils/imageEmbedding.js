import path from "path";
import { fileURLToPath } from "url";
import { loadImageAsPngBuffer } from "./imageLoader.js";

const MODEL_ID = "Xenova/clip-vit-base-patch16";
let instance;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getModel() {
  if (instance) return instance;
  const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage, LogLevel } = await import("@huggingface/transformers");
  env.logLevel = LogLevel.ERROR;
  env.cacheDir = path.join(__dirname, "../../.cache");
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
