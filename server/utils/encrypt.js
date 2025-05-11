import * as wasm from 'aes_crypto_wasm'
const cryptKey = undefined // rust有默认key，可以是undefined，也可以另外指定，但必须和前端保持一致
export function aesEncrypt(data, keySalt = '', key = cryptKey) {
  if (!data) return data
  return wasm.encrypt(data, keySalt, key)
}

export function aesDecrypt(data, keySalt = '', key = cryptKey) {
  if (!data) return data
  return wasm.decrypt(data, keySalt, key)
}
