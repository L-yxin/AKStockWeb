import { defineStore } from "pinia";

// 价格显示精度（小数位数），localStorage 持久化
const PRICE_PRECISION_KEY = "akstock_price_precision"
const DEFAULT_PRECISION = 2

const useSettingStore = defineStore("setting", () => {
  // 价格小数位数（0~6），默认 2 位
  const pricePrecision = ref(Number(localStorage.getItem(PRICE_PRECISION_KEY)) || DEFAULT_PRECISION)

  const setPricePrecision = (n) => {
    const v = Math.min(6, Math.max(0, Math.round(Number(n) || DEFAULT_PRECISION)))
    pricePrecision.value = v
    localStorage.setItem(PRICE_PRECISION_KEY, String(v))
  }

  return {
    pricePrecision,
    setPricePrecision,
  }
})

export { useSettingStore }
