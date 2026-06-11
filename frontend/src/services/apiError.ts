/**
 * 从接口错误中提取后端返回的 error 文案，失败时回退到兜底文案。
 * 统一处理 Axios 错误结构（error.response.data.error）。
 * @param error - catch 捕获的错误对象
 * @param fallback - 拿不到后端文案时的兜底文案
 * @returns 优先返回后端 error 文案，否则返回 fallback
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    return response?.data?.error || fallback;
  }
  return fallback;
}
