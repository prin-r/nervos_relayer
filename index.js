const { Sequelize, Model, DataTypes } = require("sequelize")
const { CronJob, time } = require("cron")
const config = require("./config")
const { sendRelayTx, getTransactionConfirmation } = require("./helper")

const { alert } = require("./notification")

const sequelize = new Sequelize(config.DATABASE_URL, { logging: false })

const MAX_SYMBOL_PER_TX = 25

class BandChainResult extends Model {}
BandChainResult.init(
  {
    symbol: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.DECIMAL, allowNull: false },
    requestId: { type: DataTypes.INTEGER, allowNull: false },
    resolvedTime: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    timestamps: false,
    underscored: true,
    tableName: `${config.BAND_CHAIN}_band_chain_result`,
  }
)

class SymbolDetail extends Model {}
SymbolDetail.init(
  {
    symbol: { type: DataTypes.STRING, primaryKey: true },
    interval: { type: DataTypes.INTEGER, allowNull: false },
    maxChanged: { type: DataTypes.FLOAT, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
  },
  {
    sequelize,
    timestamps: false,
    underscored: true,
    tableName: `${config.TARGET_NETWORK}_symbol_detail`,
  }
)

class LatestResult extends Model {}
LatestResult.init(
  {
    symbol: { type: DataTypes.STRING, primaryKey: true },
    value: { type: DataTypes.DECIMAL, allowNull: false },
    requestId: { type: DataTypes.INTEGER, allowNull: false },
    txHash: { type: DataTypes.STRING, allowNull: false },
    resolvedTime: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    timestamps: false,
    underscored: true,
    tableName: `${config.TARGET_NETWORK}_latest_result`,
  }
)

class RelayTx extends Model {}
RelayTx.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    txHash: { type: DataTypes.STRING, unique: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    sender: { type: DataTypes.STRING, allowNull: false },
    confirmed: { type: DataTypes.BOOLEAN, allowNull: false },
  },
  {
    sequelize,
    timestamps: false,
    underscored: true,
    tableName: `${config.TARGET_NETWORK}_relay_tx`,
  }
)

const needToRelay = (detail, bandRate, harmonyRate) => {
  if (bandRate.resolvedTime - harmonyRate.resolvedTime > detail.interval) {
    return true
  }
  if (
    (Math.abs(bandRate.value - harmonyRate.value) * 100) / harmonyRate.value >
    detail.maxChanged
  ) {
    return true
  }
  return false
}

const sendTx = async (symbols, rates, request_ids, resolved_times) => {
  const txHash = await sendRelayTx(symbols, rates, request_ids, resolved_times)
  console.log("Send tx:", txHash)
  RelayTx.create({
    txHash,
    createdAt: new Date(),
    sender: config.RELAYER_ADDRESS,
    confirmed: false,
  })
  for (let idx = 0; idx < symbols.length; idx++) {
    LatestResult.upsert({
      symbol: symbols[idx],
      value: rates[idx],
      requestId: request_ids[idx],
      resolvedTime: resolved_times[idx],
      txHash: txHash,
    })
  }
}

const updateRate = async () => {
  let symbols = []
  let rates = []
  let requestIds = []
  let resolvedTimes = []
  const symbolDetail = await SymbolDetail.findAll()
  for (const detail of symbolDetail) {
    const bandRate = await BandChainResult.findByPk(detail.symbol)
    if (bandRate === null) {
      continue
    }
    const harmonyRate = await LatestResult.findByPk(detail.symbol)
    if (harmonyRate === null || needToRelay(detail, bandRate, harmonyRate)) {
      symbols.push(bandRate.symbol)
      rates.push(bandRate.value)
      requestIds.push(bandRate.requestId)
      resolvedTimes.push(bandRate.resolvedTime)
    }
    if (symbols.length === MAX_SYMBOL_PER_TX) {
      await sendTx(symbols, rates, requestIds, resolvedTimes)
      symbols = []
      rates = []
      requestIds = []
      resolvedTimes = []
    }
  }
  if (symbols.length > 0) {
    await sendTx(symbols, rates, requestIds, resolvedTimes)
  }
}

const checkTransaction = async () => {
  for (const tx of await RelayTx.findAll({ where: { confirmed: false } })) {
    const confirmCount = await getTransactionConfirmation(tx.txHash)
    if (confirmCount === -1) {
      await alert(
        "Relay transaction failed",
        `Relay on ${config.TARGET_NETWORK} failed with hash: ${tx.txHash}`
      )
      return
    }
    if (confirmCount < 5 && (new Date() - tx.createdAt) / 1000 > 60) {
      await alert(
        "Relay transaction has not been mined",
        `Relay on ${config.TARGET_NETWORK} has not been mined with hash: ${tx.txHash}`
      )
      return
    }
    tx.confirmed = true
    await tx.save()
  }
}

;(async () => {
  new CronJob("0 * * * * *", updateRate, null, true)
  new CronJob("*/15 * * * * *", checkTransaction, null, true)
})()
