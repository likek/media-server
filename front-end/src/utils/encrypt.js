import { encrypt as wasmEncrypt, decrypt as wasmDecrypt } from 'aes_crypto_wasm'

const defaultKey = 'Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM2LQ3O4PR5678'.slice(0, 32)

export function aesEncrypt(data, keySalt = '', baseKey = defaultKey) {
  if (!data) return data
  return wasmEncrypt(data, keySalt, baseKey)
}

export function aesDecrypt(data, keySalt = '', baseKey = defaultKey) {
  if (!data) return data
  return wasmDecrypt(data, keySalt, baseKey)
}