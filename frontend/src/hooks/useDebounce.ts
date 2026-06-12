import { useEffect, useRef } from 'react';

/**
 * 防抖 hook — 用于高频状态变更（如 slider 拖动）的延迟执行
 * @param callback 要防抖执行的函数
 * @param delay 延迟毫秒数
 * @returns 返回一个触发函数，调用时会重置计时器
 */
export function useDebounce<T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number
): (...args: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // 保持 callbackRef 始终引用最新的 callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 清理计时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (...args: T) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  };
}

export default useDebounce;
