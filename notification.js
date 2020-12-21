const axios = require("axios")

const config = require("./config")

const alert = async (title, details) => {
  let dedup = config.TARGET_NETWORK + "." + title
  try {
    await axios.post(
      "https://events.pagerduty.com/v2/enqueue",
      {
        payload: {
          summary: `${config.TARGET_NETWORK}: ${title}`,
          custom_details: details,
          severity: "critical",
          source: config.TARGET_NETWORK,
        },
        event_action: "trigger",
        routing_key: config.ROUTING_KEY,
        dedup_key: dedup,
      },
      {
        headers: {
          Authorization: "Token token=" + process.env.API_TOKEN,
          From: "bun@bandprotocol.com",
          "Content-Type": "application/json",
          Accept: "application/vnd.pagerduty+json;version=2",
        },
      }
    )
  } catch (e) {
    console.log(e)
  }
}

module.exports = { alert }
