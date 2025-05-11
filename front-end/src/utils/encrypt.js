import { encrypt as wasmEncrypt, decrypt as wasmDecrypt } from 'aes_crypto_wasm'

const defaultKey = undefined // rust有默认key，可以是undefined，也可以另外指定，但必须和后端保持一致

export function aesEncrypt(data, keySalt = '', baseKey = defaultKey) {
  if (!data) return data
  return wasmEncrypt(data, keySalt, baseKey)
}

export function aesDecrypt(data, keySalt = '', baseKey = defaultKey) {
  if (!data) return data
  return wasmDecrypt(data, keySalt, baseKey)
}