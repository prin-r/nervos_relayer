const CKB = require("@nervosnetwork/ckb-sdk-core").default
const fetch = require("node-fetch")
const BN = require("bn.js")

const {
  remove0x,
  generateBandData,
  parseBandData,
  BAND_SYMBOL,
} = require("./utils")
const config = require("./config")
const { alert } = require("./notification")

const ckb = new CKB(config.CKB_NODE_URL)
const PUB_KEY = ckb.utils.privateKeyToPublicKey(config.PRIVATE_KEY)
const ARGS = "0x" + ckb.utils.blake160(PUB_KEY, "hex")
const FEE = new BN(config.FEE)
const ASK_COUNT = 16
const MIN_COUNT = 10

const fetchSymbols = async () => {
  let res = await fetch(
    config.BAND_CHAIN +
      `/oracle/price_symbols?ask_count=${ASK_COUNT}&min_count=${MIN_COUNT}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  )
  res = await res.json()
  return res["result"]
}

const fetchBandOracle = async (symbols) => {
  let res = await fetch(config.BAND_CHAIN + "/oracle/request_prices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      { symbols, ask_count: ASK_COUNT, min_count: MIN_COUNT },
      null,
      "  "
    ),
  })
  res = await res.json()
  const pricesWithTimestamps = res["result"].map(
    ({ px, multiplier, resolve_time }) => ({
      price: Math.round((px * 1e6) / multiplier),
      timestamp: Number(resolve_time),
    })
  )

  return { pricesWithTimestamps }
}

const secp256k1LockScript = async () => {
  console.log("=-=-=-=-= 2.2.0.a.0")
  const secp256k1Dep = (await ckb.loadDeps()).secp256k1Dep
  console.log("=-=-=-=-= 2.2.0.a.1")
  return {
    codeHash: secp256k1Dep.codeHash,
    hashType: secp256k1Dep.hashType,
    args: ARGS,
  }
}

const getCells = async () => {
  let lock = null
  console.log("=-=-=-=-= 2.0.0")
  lock = await secp256k1LockScript(ARGS)
  let payload = {
    id: 1,
    jsonrpc: "2.0",
    method: "get_cells",
    params: [
      {
        script: {
          code_hash: lock.codeHash,
          hash_type: lock.hashType,
          args: lock.args,
        },
        script_type: "lock",
      },
      "asc",
      "0x3e8",
    ],
  }
  const body = JSON.stringify(payload, null, "  ")

  console.log("=-=-=-=-= 2.0.1")
  let res = await fetch(config.CKB_INDEXER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  })
  console.log("=-=-=-=-= 2.0.2")
  res = await res.json()
  return res.result.objects
}

const updateOracleLiveCells = async (liveCells, pricesWithTimestamps) => {
  console.log("=-=-=-=-= 2.2.0")
  const secp256k1Dep = (await ckb.loadDeps()).secp256k1Dep
  console.log("=-=-=-=-= 2.2.0.a")
  const lock = await secp256k1LockScript()
  console.log("=-=-=-=-= 2.2.0.b")
  const pricesData = pricesWithTimestamps.map(({ price, timestamp }, index) =>
    generateBandData(price, index, timestamp)
  )
  console.log("=-=-=-=-= 2.2.1")
  let rawTx = {
    version: "0x0",
    cellDeps: [{ outPoint: secp256k1Dep.outPoint, depType: "depGroup" }],
    headerDeps: [],
  }
  let inputs = []
  let outputs = []
  let outputsData = []
  const bandLiveCells = liveCells.filter((cell) =>
    remove0x(cell.output_data).startsWith(BAND_SYMBOL)
  )
  console.log("=-=-=-=-= 2.2.2")
  bandLiveCells.forEach((cell, cellIndex) => {
    const { index } = parseBandData(cell.output_data)
    inputs.push({
      previousOutput: {
        txHash: cell.out_point.tx_hash,
        index: cell.out_point.index,
      },
      since: "0x0",
    })
    outputs.push({
      capacity:
        cellIndex === bandLiveCells.length - 1
          ? `0x${new BN(remove0x(cell.output.capacity), "hex")
              .sub(FEE)
              .toString(16)}`
          : cell.output.capacity,
      lock,
      type: null,
    })
    outputsData.push(pricesData[index])
  })
  rawTx = {
    ...rawTx,
    inputs,
    outputs,
    outputsData,
    witnesses: inputs.map((_, i) =>
      i > 0 ? "0x" : { lock: "", inputType: "", outputType: "" }
    ),
  }
  console.log("=-=-=-=-= 2.2.3")
  const signedTx = ckb.signTransaction(config.PRIVATE_KEY)(rawTx)
  const txHash = await ckb.rpc.sendTransaction(signedTx)
  console.log("=-=-=-=-= 2.2.4")
  return txHash
}

const sendRelayTx = async (symbols) => {
  console.log("=-=-=-=-=-=-=-=-=-=-=-=-= 2.0")
  const liveCells = await getCells()
  if (liveCells.length === 0) {
    throw "cells is empty"
  }
  console.log("=-=-=-=-=-=-=-=-=-=-=-=-= 2.1")
  const { pricesWithTimestamps } = await fetchBandOracle(symbols)
  console.log("=-=-=-=-=-=-=-=-=-=-=-=-= 2.2")
  const txHash = await updateOracleLiveCells(liveCells, pricesWithTimestamps)
  console.log("=-=-=-=-=-=-=-=-=-=-=-=-= 2.3")

  return txHash
}

const getTransactionConfirmation = async (txhash) => {
  try {
    const tx = await ckb.rpc.getTransaction(txhash)
    if (!tx) {
      throw "tx is null"
    }
    if (!tx.txStatus) {
      throw "tx.txStatus is not available"
    }
    const txStatus = tx.txStatus.status
    if (txStatus !== "committed") {
      throw `tx status is ${txStatus}`
    }
    return true
  } catch (err) {
    console.log(err)
  }
  return false
}

module.exports = {
  fetchSymbols,
  // transactionStatus,
  sendRelayTx,
}
;(async () => {
  console.log("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-= 1")
  const symbols = await fetchSymbols()
  console.log("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-= 2")
  const txHash = await sendRelayTx(symbols)
  console.log("txHash: ", txHash)

  let status = false
  while (!status) {
    status = await getTransactionConfirmation(txHash)
    console.log("<><><><>", await getTransactionConfirmation(txHash))
    await new Promise((r) => setTimeout(r, 5000))
  }
  console.log("done!!!")
})()
