import * as wasm from 'aes_crypto_wasm'
const cryptKey = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM2LQ3O4PR5678".slice(0, 32)
export function aesEncrypt(data, keySalt = '', key = cryptKey) {
  if (!data) return data
  return wasm.encrypt(data, keySalt, key)
}

export function aesDecrypt(data, keySalt = '', key = cryptKey) {
  if (!data) return data
  return wasm.decrypt(data, keySalt, key)
}
