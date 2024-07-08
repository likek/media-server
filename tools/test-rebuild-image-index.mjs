import { aesEncrypt, aesDecrypt } from "../server/utils/encrypt.js";

const PORT = process.env.PORT || "7790";
const fingerprint = `FP-test-${Date.now()}`;

const makeHeaders = () => {
  const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    "content-type": "application/json",
    "x-fp": aesEncrypt(fingerprint, salt),
    "x-s": aesEncrypt(salt),
  };
};

const r = await fetch(`http://localhost:${PORT}/i/user/rebuildImageHash`, {
  method: "POST",
  headers: makeHeaders(),
  body: JSON.stringify({ max: 5 }),
});

const json = await r.json().catch(async () => ({ text: await r.text(), status: r.status }));
let data = json;
if (r.headers.get("x-encrypt") === "true" && json?.d) {
  const salt = aesDecrypt(r.headers.get("x-s") || "");
  data = JSON.parse(aesDecrypt(json.d, salt));
}

console.log(r.status, data);

