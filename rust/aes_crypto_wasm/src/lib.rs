use aes::Aes256;
use cbc::{Decryptor, Encryptor};
use cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

const DEFAULT_BASE_KEY: &str = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM";

fn pad_zero(mut data: Vec<u8>, block_size: usize) -> Vec<u8> {
    let rem = data.len() % block_size;
    if rem != 0 {
        data.extend(vec![0u8; block_size - rem]);
    }
    data
}

fn get_key(key: &str) -> Vec<u8> {
    pad_zero(key.as_bytes().to_vec(), 32)
}

fn get_iv(key: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    let result = hasher.finalize();
    result[..16].to_vec()
}

// 注意：这里按「字节」补齐/截断，不能按 char 截断。
// key_salt 由外部传入（HTTP 头 / query / cookie），可能包含多字节字符；
// 直接对 String 做 truncate(32) 一旦落在 UTF-8 字符中间就会 panic。
fn combine_key(key_salt: &str, base_key: Option<&str>) -> String {
    let mut key = format!("{}{}", key_salt, base_key.unwrap_or(DEFAULT_BASE_KEY));
    let mut bytes = std::mem::take(&mut key).into_bytes();
    while bytes.len() < 32 {
        bytes.push(b'0');
    }
    bytes.truncate(32);
    String::from_utf8_lossy(&bytes).into_owned()
}

#[wasm_bindgen]
pub fn encrypt(data: &str, key_salt: &str, base_key: Option<String>) -> String {
    let key = combine_key(key_salt, base_key.as_deref());
    let cipher_key = get_key(&key);
    let iv = get_iv(&key);

    let cipher = match Encryptor::<Aes256>::new_from_slices(&cipher_key, &iv) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let mut buffer = data.as_bytes().to_vec();
    buffer.resize(buffer.len() + 16, 0); // extra space for padding

    match cipher.encrypt_padded_mut::<Pkcs7>(&mut buffer, data.len()) {
        Ok(ciphertext) => general_purpose::STANDARD.encode(ciphertext),
        Err(_) => String::new(),
    }
}

/// 解密失败时返回空串，绝不 panic。
///
/// 原因：wasm32-unknown-unknown 没有栈展开，Rust panic 会直接触发 trap，
/// `__stack_pointer` 无法回滚，每次 panic 都会永久泄漏一块影子栈。
/// 泄漏累积到栈指针下溢后，模块内所有函数入口都会 trap
/// ("memory access out of bounds")，整个 wasm 实例彻底失效。
#[wasm_bindgen]
pub fn decrypt(data: &str, key_salt: &str, base_key: Option<String>) -> String {
    let key = combine_key(key_salt, base_key.as_deref());
    let cipher_key = get_key(&key);
    let iv = get_iv(&key);

    let mut decoded = match general_purpose::STANDARD.decode(data) {
        Ok(decoded) => decoded,
        Err(_) => return "Invalid base64".to_string(),
    };

    // Pkcs7 解填充要求密文非空且长度为块大小的整数倍，否则返回 Err
    let cipher = match Decryptor::<Aes256>::new_from_slices(&cipher_key, &iv) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    match cipher.decrypt_padded_mut::<Pkcs7>(&mut decoded) {
        Ok(decrypted) => String::from_utf8_lossy(decrypted).into_owned(),
        Err(_) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aes_roundtrip() {
        let plain = "FP-2ea9acead014c1f870e3be9d623b4cd5";
        let salt = "362544s2pfk05";
        let key = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM";

        let enc = encrypt(plain, salt, Some(key.to_string()));
        let dec = decrypt(&enc, salt, Some(key.to_string()));
        assert_eq!(plain, dec);
    }

    #[test]
    fn test_has_salt() {
        let key = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM";
        let plain = "FP-2ea9acead014c1f870e3be9d623b4cd5";
        let salt = "362544s2pfk05";
        let expected = "0NYi3hP5SrPS8G++eQ75d4M+FYFSr2QCUmKBHnDSoJrJkMuk8dEVQU2Pg+HUtkcj";

        let enc = encrypt(plain, salt, Some(key.to_string()));
        assert_eq!(expected, enc);
    }

    #[test]
    fn test_no_salt() {
        let key = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM";
        let plain = "362544s2pfk05";
        let salt = "";
        let expected = "b4e6fhs7TgxwX9rBXyBpGQ==";

        let enc = encrypt(plain, salt, Some(key.to_string()));
        assert_eq!(expected, enc);
    }

    #[test]
    fn test_default_key() {
        let plain = "test-default-key";
        let salt = "123abc";
        let enc = encrypt(plain, salt, None);
        let dec = decrypt(&enc, salt, None);
        assert_eq!(plain, dec);
    }

    // 非法输入必须优雅返回，不能 panic —— panic 会污染 wasm 影子栈
    #[test]
    fn test_decrypt_never_panics() {
        let salt = "362544s2pfk05";
        for bad in [
            "",
            "!!!",
            "YQ==",                          // 1 字节，非 16 倍数
            "AAAAAAAAAAAAAAAAAAAAAA==",      // 16 倍数但填充非法
            "中文不是base64",
        ] {
            // 只要不 panic 即可；返回值不做断言
            let _ = decrypt(bad, salt, None);
        }
    }

    // 多字节 key_salt 不能让 combine_key panic
    #[test]
    fn test_multibyte_salt() {
        let plain = "hello";
        let salt = "中文盐值";
        let enc = encrypt(plain, salt, None);
        let dec = decrypt(&enc, salt, None);
        assert_eq!(plain, dec);
    }
}
