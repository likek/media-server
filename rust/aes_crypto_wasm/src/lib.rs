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

fn combine_key(key_salt: &str, base_key: Option<&str>) -> String {
    let mut key = format!("{}{}", key_salt, base_key.unwrap_or(DEFAULT_BASE_KEY));
    key.truncate(32);
    key
}

#[wasm_bindgen]
pub fn encrypt(data: &str, key_salt: &str, base_key: Option<String>) -> String {
    let key = combine_key(key_salt, base_key.as_deref());
    let cipher_key = get_key(&key);
    let iv = get_iv(&key);

    let cipher = Encryptor::<Aes256>::new_from_slices(&cipher_key, &iv).unwrap();

    let mut buffer = [0u8; 1024];
    let data_bytes = data.as_bytes();
    let msg_len = data_bytes.len();
    buffer[..msg_len].copy_from_slice(data_bytes);

    let ciphertext = cipher.encrypt_padded_mut::<Pkcs7>(&mut buffer, msg_len).unwrap();
    general_purpose::STANDARD.encode(ciphertext)
}

#[wasm_bindgen]
pub fn decrypt(data: &str, key_salt: &str, base_key: Option<String>) -> String {
    let key = combine_key(key_salt, base_key.as_deref());
    let cipher_key = get_key(&key);
    let iv = get_iv(&key);

    let mut decoded = general_purpose::STANDARD.decode(data).unwrap();
    let cipher = Decryptor::<Aes256>::new_from_slices(&cipher_key, &iv).unwrap();

    let decrypted = cipher.decrypt_padded_mut::<Pkcs7>(&mut decoded).unwrap();
    String::from_utf8(decrypted.to_vec()).unwrap()
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
        let encreypt_plain = "0NYi3hP5SrPS8G++eQ75d4M+FYFSr2QCUmKBHnDSoJrJkMuk8dEVQU2Pg+HUtkcj";

        let enc = encrypt(plain, salt, Some(key.to_string()));
        assert_eq!(encreypt_plain, enc);
    }

    #[test]
    fn test_no_salt() {
        let key = "Y1G2IC3F4WE5ZDXBVU67JT8H9SA0K1NM";
        let plain = "362544s2pfk05";
        let salt = "";
        let encreypt_plain = "b4e6fhs7TgxwX9rBXyBpGQ==";

        let enc = encrypt(plain, salt, Some(key.to_string()));
        assert_eq!(encreypt_plain, enc);
    }

    #[test]
    fn test_default_key() {
        let plain = "test-default-key";
        let salt = "123abc";
        let enc = encrypt(plain, salt, None);
        let dec = decrypt(&enc, salt, None);
        assert_eq!(plain, dec);
    }
}