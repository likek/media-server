import { aesEncrypt, aesDecrypt } from "../server/utils/encrypt.js";
import sharp from "sharp";

const fingerprint = `FP-test-${Date.now()}`;
const makeHeaders = () => {
  const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    "x-fp": aesEncrypt(fingerprint, salt),
    "x-s": aesEncrypt(salt),
  };
};

const buf = await sharp({
  create: {
    width: 96,
    height: 96,
    channels: 3,
    background: { r: 255, g: 0, b: 0 },
  },
})
  .png()
  .toBuffer();

const uploadForm = new FormData();
uploadForm.append("file", new Blob([buf], { type: "image/png" }), "red.png");

let r = await fetch("http://localhost:7788/i/user/upload?parentId=", {
  method: "POST",
  headers: makeHeaders(),
  body: uploadForm,
});
const uploadJson = await r.json().catch(async () => ({ text: await r.text(), status: r.status }));
let uploadRes = uploadJson;
if (r.headers.get("x-encrypt") === "true" && uploadJson?.d) {
  const salt = aesDecrypt(r.headers.get("x-s") || "");
  uploadRes = JSON.parse(aesDecrypt(uploadJson.d, salt));
}
console.log("upload", r.status, uploadRes);

const searchForm = new FormData();
searchForm.append("file", new Blob([buf], { type: "image/png" }), "query.png");
searchForm.append("topK", "10");

r = await fetch("http://localhost:7788/i/user/searchByImage", {
  method: "POST",
  headers: makeHeaders(),
  body: searchForm,
});
const searchJson = await r.json().catch(async () => ({ text: await r.text(), status: r.status }));
let searchRes = searchJson;
if (r.headers.get("x-encrypt") === "true" && searchJson?.d) {
  const salt = aesDecrypt(r.headers.get("x-s") || "");
  searchRes = JSON.parse(aesDecrypt(searchJson.d, salt));
}
console.log("search", r.status, searchRes.total, searchRes.files?.[0]);
