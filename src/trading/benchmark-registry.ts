export type BenchmarkCapability =
  | 'multi-agent-debate'
  | 'quant-r-and-d'
  | 'event-driven-engine'
  | 'low-latency-execution'
  | 'crypto-connectivity'
  | 'research-backtesting'
  | 'reinforcement-learning'
  | 'financial-data'
  | 'finance-llm';

export interface OpenSourceBenchmark {
  id: string;
  repository: string;
  capability: BenchmarkCapability[];
  helixTreatment: 'reference' | 'adapter' | 'optional-component' | 'reimplement';
  licenseNote: string;
}

export const OPEN_SOURCE_BENCHMARKS: OpenSourceBenchmark[] = [
  { id: 'tradingagents', repository: 'TauricResearch/TradingAgents', capability: ['multi-agent-debate', 'finance-llm'], helixTreatment: 'reimplement', licenseNote: 'Apache-2.0; preserve provenance if code is reused.' },
  { id: 'qlib', repository: 'microsoft/qlib', capability: ['quant-r-and-d', 'research-backtesting'], helixTreatment: 'reference', licenseNote: 'MIT; verify dependency/data terms.' },
  { id: 'rd-agent', repository: 'microsoft/RD-Agent', capability: ['quant-r-and-d', 'multi-agent-debate'], helixTreatment: 'reimplement', licenseNote: 'Review upstream license and third-party terms before code reuse.' },
  { id: 'lean', repository: 'QuantConnect/Lean', capability: ['event-driven-engine', 'research-backtesting'], helixTreatment: 'reference', licenseNote: 'Apache-2.0; review dependencies.' },
  { id: 'nautilus-trader', repository: 'nautechsystems/nautilus_trader', capability: ['event-driven-engine', 'low-latency-execution'], helixTreatment: 'reference', licenseNote: 'LGPL-3.0; integration and linking obligations require review.' },
  { id: 'hummingbot', repository: 'hummingbot/hummingbot', capability: ['crypto-connectivity', 'low-latency-execution'], helixTreatment: 'reference', licenseNote: 'Apache-2.0; review connector/data terms.' },
  { id: 'freqtrade', repository: 'freqtrade/freqtrade', capability: ['crypto-connectivity', 'research-backtesting'], helixTreatment: 'reference', licenseNote: 'GPL-3.0; do not copy into a closed core without an explicit licensing plan.' },
  { id: 'vectorbt', repository: 'polakowo/vectorbt', capability: ['research-backtesting'], helixTreatment: 'optional-component', licenseNote: 'Apache-2.0 with Commons Clause; commercial redistribution requires careful review.' },
  { id: 'finrl', repository: 'AI4Finance-Foundation/FinRL', capability: ['reinforcement-learning', 'research-backtesting'], helixTreatment: 'optional-component', licenseNote: 'MIT; review data/model terms.' },
  { id: 'tensortrade', repository: 'tensortrade-org/tensortrade', capability: ['reinforcement-learning', 'research-backtesting'], helixTreatment: 'reference', licenseNote: 'Apache-2.0; review current upstream status.' },
  { id: 'openbb', repository: 'OpenBB-finance/OpenBB', capability: ['financial-data'], helixTreatment: 'adapter', licenseNote: 'Open-source platform; each data provider still has its own terms.' },
  { id: 'yfinance', repository: 'ranaroussi/yfinance', capability: ['financial-data'], helixTreatment: 'adapter', licenseNote: 'Apache-2.0; Yahoo data usage terms apply.' },
  { id: 'ccxt', repository: 'ccxt/ccxt', capability: ['crypto-connectivity'], helixTreatment: 'adapter', licenseNote: 'Review current license and individual exchange API terms.' },
  { id: 'hyperliquid-sdk', repository: 'hyperliquid-dex/hyperliquid-python-sdk', capability: ['crypto-connectivity', 'low-latency-execution'], helixTreatment: 'adapter', licenseNote: 'MIT; venue/API terms apply.' },
  { id: 'fingpt', repository: 'AI4Finance-Foundation/FinGPT', capability: ['finance-llm'], helixTreatment: 'optional-component', licenseNote: 'MIT repo license; model/data licensing must be checked separately.' },
  { id: 'finrobot', repository: 'AI4Finance-Foundation/FinRobot', capability: ['finance-llm', 'financial-data'], helixTreatment: 'reference', licenseNote: 'Review repository, model, and data terms before reuse.' },
];
