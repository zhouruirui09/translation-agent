// 长超时网络通道：Node 内置 fetch 默认 5 分钟无响应即断开（报 "fetch failed"），
// 而 Kimi k3.1-pro 推理型报告单次可能超过 5 分钟，这里改用 undici 显式放宽超时。
import { Agent, fetch as undiciFetch } from 'undici';

const LONG_TIMEOUT_MS = 15 * 60 * 1000;

const longAgent = new Agent({
  headersTimeout: LONG_TIMEOUT_MS,
  bodyTimeout: LONG_TIMEOUT_MS,
  keepAliveTimeout: 30 * 1000,
});

export function netFetch(url, init = {}) {
  return undiciFetch(url, { ...init, dispatcher: longAgent });
}

export function describeFetchError(label, err) {
  const cause = err?.cause ? `（${err.cause.code || err.cause.message || err.cause}）` : '';
  return new Error(`${label} 网络请求失败：${err?.message || err}${cause}`);
}
