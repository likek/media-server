import { AES, enc, SHA256, mode, pad } from "crypto-js"

const cryptKey = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM2LQ3O4PR5678".slice(0, 32)

function getKey(key = cryptKey) {
    return enc.Utf8.parse(key)
}

function getIv(key = cryptKey) {
    const ivHex = SHA256(key).toString(enc.Hex).substring(0, 32) // 16字节
    return enc.Hex.parse(ivHex)  // 用Hex解析
}

export function aesEncrypt(data, keySalt = '', key = cryptKey) {
    if (!data) return data
    key = `${keySalt}${key}`.slice(0, 32)
    const cipherKey = getKey(key)
    const iv = getIv(key)
    return AES.encrypt(data, cipherKey, {
        iv,
        mode: mode.CBC,
        padding: pad.Pkcs7  // 和后端保持一致
    }).toString()
}

export function aesDecrypt(data, keySalt = '', key = cryptKey) {
    if (!data) return data
    key = `${keySalt}${key}`.slice(0, 32)
    const cipherKey = getKey(key)
    const iv = getIv(key)
    const decrypted = AES.decrypt(data, cipherKey, {
        iv,
        mode: mode.CBC,
        padding: pad.Pkcs7
    })
    return decrypted.toString(enc.Utf8)
}