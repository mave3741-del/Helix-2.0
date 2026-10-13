// Node-native technical analysis — this is the JS equivalent of TA-Lib /
// pandas-ta, so nothing here needs a Python sidecar.
import { RSI, MACD, BollingerBands, SMA, EMA, ATR, Stochastic } from "technicalindicators";

export function rsi(closes: number[], period = 14): number[] {
  return RSI.calculate({ values: closes, period });
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  return MACD.calculate({
    values: closes,
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
}

export function bollingerBands(closes: number[], period = 20, stdDev = 2) {
  return BollingerBands.calculate({ values: closes, period, stdDev });
}

export function sma(closes: number[], period = 20): number[] {
  return SMA.calculate({ values: closes, period });
}

export function ema(closes: number[], period = 20): number[] {
  return EMA.calculate({ values: closes, period });
}

export function atr(high: number[], low: number[], close: number[], period = 14): number[] {
  return ATR.calculate({ high, low, close, period });
}

export function stochastic(high: number[], low: number[], close: number[], period = 14, signalPeriod = 3) {
  return Stochastic.calculate({ high, low, close, period, signalPeriod });
}
