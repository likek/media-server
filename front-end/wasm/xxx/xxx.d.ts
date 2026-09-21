/* tslint:disable */
/* eslint-disable */
export function encrypt(data: string, key_salt: string, base_key?: string | null): string;
/**
 * 解密失败时返回空串，绝不 panic。
 *
 * 原因：wasm32-unknown-unknown 没有栈展开，Rust panic 会直接触发 trap，
 * `__stack_pointer` 无法回滚，每次 panic 都会永久泄漏一块影子栈。
 * 泄漏累积到栈指针下溢后，模块内所有函数入口都会 trap
 * ("memory access out of bounds")，整个 wasm 实例彻底失效。
 */
export function decrypt(data: string, key_salt: string, base_key?: string | null): string;
