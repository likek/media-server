import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { aesEncrypt } from './encrypt'

// 创建指纹实例
const fpPromise = FingerprintJS.load()

// 获取设备指纹
export async function getFingerprint() {
  try {
    const fp = await fpPromise
    const result = await fp.get()
    return `FP-${result.visitorId}`
  } catch (error) {
    console.error('获取设备指纹失败:', error)
    return `FP-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`
  }
}

// 获取加密后的指纹和salt
export async function getEncryptedFingerprint() {
  const fingerprint = await getFingerprint()
  const salt = `${Date.now().toString().slice(8)}${Math.random().toString(36).substring(2, 10)}`
  const encryptedFingerprint = aesEncrypt(fingerprint, salt)
  const encryptedSalt = aesEncrypt(salt)
  
  return {
    fingerprint,
    encryptedFingerprint,
    salt,
    encryptedSalt
  }
}