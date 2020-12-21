const config = () => {
  const config = {
    DATABASE_URL: process.env.DATABASE_URL || true,
    TARGET_NETWORK: process.env.TARGET_NETWORK || true,
    BAND_CHAIN:
      process.env.BAND_CHAIN || "http://guanyu-testnet3-query.bandchain.org",
    FEE: process.env.FEE || 37_000,
    ROUTING_KEY: process.env.ROUTING_KEY || "xxxx",
    TX_WAIT_PERIOD: parseInt(process.env.TX_WAIT_PERIOD) || true,
    API_TOKEN: process.env.API_TOKEN || true,
    CKB_NODE_URL: process.env.CKB_NODE_URL || "https://testnet.ckb.dev/rpc",
    CKB_INDEXER_URL:
      process.env.CKB_INDEXER_URL || "https://testnet.ckb.dev/indexer",
    PRIVATE_KEY: process.env.PRIVATE_KEY || "xxxx",
  }
  if (!config.DATABASE_URL) {
    throw new Error("Missing DB url")
  }
  if (!config.TARGET_NETWORK) {
    throw new Error("Missing target network")
  }
  if (!config.BAND_CHAIN) {
    throw new Error("Missing band chain network")
  }
  if (!config.FEE) {
    throw new Error("Missing fee")
  }
  if (!config.TX_WAIT_PERIOD) {
    throw new Error("Missing tx wait period")
  }
  if (!config.API_TOKEN) {
    throw new Error("Missing api token")
  }
  if (!config.CKB_NODE_URL) {
    throw new Error("Missing CKB_NODE_URL")
  }
  if (!config.CKB_INDEXER_URL) {
    throw new Error("Missing CKB_INDEXER_URL")
  }
  if (!config.PRIVATE_KEY) {
    throw new Error("Missing private key")
  }
  return config
}

module.exports = config()
