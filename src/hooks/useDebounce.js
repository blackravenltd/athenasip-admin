export default function useDebounce(fn, timeout) {
  return (...args) => {
    if (fn.timeout) clearTimeout(fn.timeout)
    fn.timeout = setTimeout(() => {
      return fn(...args)
    }, timeout)
  }
}
