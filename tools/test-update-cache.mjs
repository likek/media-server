import { aesEncrypt, aesDecrypt } from "../server/utils/encrypt.js";

const fingerprint = `FP-test-${Date.now()}`;
const makeHeaders = () => {
  const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).slice(2, 10)}`;
  return {
    "content-type": "application/json",
    "x-fp": aesEncrypt(fingerprint, salt),
    "x-s": aesEncrypt(salt),
  };
};

const r = await fetch("http://localhost:7789/i/user/updateCache", {
  method: "POST",
  headers: makeHeaders(),
  body: JSON.stringify({ id: null }),
});

const json = await r.json().catch(async () => ({ text: await r.text(), status: r.status }));
let data = json;
if (r.headers.get("x-encrypt") === "true" && json?.d) {
  const salt = aesDecrypt(r.headers.get("x-s") || "");
  data = JSON.parse(aesDecrypt(json.d, salt));
}

console.log(r.status, data);

